import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { CopilotClient } from "@github/copilot-sdk";

const TRANSLATOR_PROMPT = `You are an expert English-to-Simplified-Chinese translator for a professional AI news publication.

Write fluent, concise, publication-ready Chinese that reads as if a native Chinese technology editor wrote it originally, while preserving the source meaning exactly.

- Preserve all Markdown structure, paragraph boundaries, emphasis, links, images, inline code, fenced code, and URLs.
- Translate every reader-facing English phrase, including headings, visible link text, image alt text, and labels such as "points" and "comments".
- Translate article and post titles inside links; for example, [What verification patterns are you using?](URL) must become [你们在使用哪些验证模式？](URL). Preserve only genuine product, model, repository, and person names.
- Reorganize clauses and sentence order when needed for natural Chinese. Translate meaning and rhetoric, not English grammar.
- Avoid translationese, unnecessary passive voice, stacked modifiers, repeated subjects, and literal calques that a native Chinese editor would not use.
- Keep usernames, company/product/model/repository names, acronyms, commands, code, paths, numbers, dates, and units unchanged.
- Preserve attribution, uncertainty, and modality exactly: "may", "might", "could", "should", and "must" are not interchangeable, and reported claims must not become established facts.
- Preserve every token beginning with VIBEWATCHPROTECTEDTOKEN exactly once and unchanged; these tokens represent URLs or code that will be restored after translation.
- Use established Chinese technical terms; retain English only where Chinese would be less precise.
- Render idioms by meaning, not word-for-word.
- Do not summarize, explain, embellish, add title brackets, or introduce facts.
- Silently check for omissions, mistranslations, English leakage, and broken Markdown.
- Output only the translated Markdown.`;

const REVIEWER_PROMPT = `You are the final bilingual copy editor for a professional AI news publication.

Given an English source and a Chinese draft, return a corrected Simplified-Chinese Markdown draft.

- Fix omissions, semantic drift, awkward literal phrasing, inconsistent terminology, untranslated reader-facing English, punctuation, and Markdown damage.
- Translate sentence-like article/post titles inside link labels and all image alt text. Do not mistake titles for protected product names.
- Rewrite English-shaped sentence structures into idiomatic, concise Chinese while retaining every fact and qualifier.
- Correct any drift in attribution, certainty, or modality; never strengthen "may/might/could" into "will/must".
- Preserve every token beginning with VIBEWATCHPROTECTEDTOKEN exactly once and unchanged.
- The finished text must feel originally written and professionally edited in Chinese, not machine-translated.
- Preserve every URL, username, product/model name, number, date, code span, image, paragraph, and heading level.
- Do not summarize, embellish, add title brackets, or add commentary.
- Output only the corrected Markdown.`;

function parseArgs(argv) {
  const options = {
    root: "reports",
    model: "gemini-3.8-flash",
    effort: "default",
    fallbackModel: "gpt-5.4",
    fallbackEffort: "low",
    concurrency: 2,
    force: false,
    resume: false,
    limit: null,
    outputRoot: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    switch (argument) {
      case "--root":
        options.root = value;
        index += 1;
        break;
      case "--model":
        options.model = value;
        index += 1;
        break;
      case "--effort":
        options.effort = value;
        index += 1;
        break;
      case "--fallback-model":
        options.fallbackModel = value;
        index += 1;
        break;
      case "--fallback-effort":
        options.fallbackEffort = value;
        index += 1;
        break;
      case "--concurrency":
        options.concurrency = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--force":
        options.force = true;
        break;
      case "--resume":
        options.resume = true;
        break;
      case "--limit":
        options.limit = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--output-root":
        options.outputRoot = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

async function findMissingTranslations(
  root,
  { force = false, resume = false, limit = null, outputRoot = null } = {},
) {
  const translations = [];
  const resolvedOutputRoot = outputRoot ? path.resolve(outputRoot) : null;

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".zh.md")) {
        const translationPath = resolvedOutputRoot
          ? path.join(
              resolvedOutputRoot,
              path.relative(root, entryPath).replace(/\.md$/, ".zh.md"),
            )
          : entryPath.replace(/\.md$/, ".zh.md");
        if (force) {
          if (resume) {
            try {
              await fs.access(translationPath);
              continue;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
          }
          translations.push({ sourcePath: entryPath, translationPath });
          continue;
        }
        try {
          await fs.access(translationPath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          translations.push({ sourcePath: entryPath, translationPath });
        }
      }
    }
  }

  await visit(root);
  const sorted = translations.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );
  return limit === null ? sorted : sorted.slice(0, limit);
}

function markdownSignature(markdown) {
  return {
    headingLevels: [...markdown.matchAll(/^(#{1,6})\s/gm)].map((match) => match[1].length),
    urls: [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .sort(),
    imageUrls: [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .sort(),
    codeFences: (markdown.match(/^```/gm) ?? []).length,
    inlineCodeMarkers: (markdown.match(/(?<!`)`(?!`)/g) ?? []).length,
    boldMarkers: (markdown.match(/\*\*/g) ?? []).length,
    thematicBreaks: (markdown.match(/^---$/gm) ?? []).length,
  };
}

function removeAddedInlineCodeMarkers(markdown) {
  return markdown.replace(/(?<!`)`{1,2}([^`\n]+)`{1,2}(?!`)/g, "$1");
}

function visibleLanguageRatio(markdown) {
  const visibleText = markdown
    .replace(/VIBEWATCHPROTECTEDTOKEN\d{6}/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[|\[|\]\([^)]*\)/g, " ");
  const hanCharacters = (visibleText.match(/\p{Script=Han}/gu) ?? []).length;
  const latinCharacters = (visibleText.match(/[A-Za-z]/g) ?? []).length;
  return hanCharacters / Math.max(1, hanCharacters + latinCharacters);
}

function protectMarkdown(markdown) {
  const protections = [];
  const protect = (value) => {
    const token = `VIBEWATCHPROTECTEDTOKEN${String(protections.length).padStart(6, "0")}`;
    protections.push({ token, value });
    return token;
  };

  let protectedMarkdown = markdown.replace(/```[\s\S]*?```/g, protect);
  protectedMarkdown = protectedMarkdown.replace(/(?<!`)`[^`\n]+`(?!`)/g, protect);
  protectedMarkdown = protectedMarkdown.replace(
    /(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (_, prefix, destination, suffix) => `${prefix}${protect(destination)}${suffix}`,
  );
  protectedMarkdown = protectedMarkdown.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => protect(url),
  );

  return { protectedMarkdown, protections };
}

function restoreProtectedMarkdown(markdown, protections) {
  let restored = markdown;
  for (const { token, value } of protections) {
    const occurrences = restored.split(token).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `protected token ${token} occurred ${occurrences} times instead of once`,
      );
    }
    restored = restored.replace(token, value);
  }
  if (/VIBEWATCHPROTECTEDTOKEN\d{6}/.test(restored)) {
    throw new Error("unexpected protected token remains");
  }
  return restored;
}

function untranslatedLinkLabels(markdown) {
  return [...markdown.matchAll(/!?\[([^\]]+)\]\([^)]+\)/g)]
    .map((match) => match[1].trim())
    .filter((label) => {
      if (/\p{Script=Han}/u.test(label) || /^(?:https?|www\.)/i.test(label)) {
        return false;
      }
      const words = label.match(/[A-Za-z][A-Za-z'.-]*/g) ?? [];
      const sentenceStarter =
        /^(?:a|an|the|ask|autonomous|built|can|do|how|i|is|my|openai|show|the|this|what|when|where|who|why|will)\b/i.test(
          label,
        );
      return words.length >= 5 || (sentenceStarter && words.length >= 3);
    });
}

function validateTranslation(source, translation) {
  const errors = [];
  const expected = markdownSignature(source);
  const actual = markdownSignature(translation);

  for (const key of [
    "headingLevels",
    "urls",
    "imageUrls",
    "codeFences",
    "inlineCodeMarkers",
    "boldMarkers",
    "thematicBreaks",
  ]) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
      errors.push(`${key} changed`);
    }
  }

  if (visibleLanguageRatio(translation) < 0.35) {
    errors.push("too much reader-facing English remains");
  }

  if (/^```(?:markdown|md)?\s*\n[\s\S]*\n```$/i.test(translation.trim())) {
    errors.push("translation is wrapped in a code fence");
  }

  if (translation.trim().length === 0) {
    errors.push("translation is empty");
  }

  return errors;
}

async function requestMarkdown(client, { model, effort, systemPrompt, prompt }) {
  const session = await client.createSession({
    model,
    ...(effort && effort !== "default" ? { reasoningEffort: effort } : {}),
    systemMessage: { mode: "replace", content: systemPrompt },
    availableTools: [],
    enableSessionStore: false,
  });

  try {
    const response = await session.sendAndWait({ prompt }, 10 * 60 * 1000);
    const content = response?.data.content?.trim();
    if (!content) {
      throw new Error(`${model} returned no translation`);
    }
    return content;
  } finally {
    await session.disconnect();
  }
}

function applyLinkLabelTranslations(markdown, translations) {
  let repaired = markdown;
  for (const { source, translation } of translations) {
    if (!source || !translation || /[\]\r\n]/.test(translation)) {
      throw new Error(`Invalid link-label translation for: ${source}`);
    }
    if (source === translation) continue;
    repaired = repaired.split(`[${source}](`).join(`[${translation}](`);
  }
  return repaired;
}

async function repairLinkLabels(client, translation, labels, modelConfig) {
  const response = await requestMarkdown(client, {
    ...modelConfig,
    systemPrompt: `Translate reader-facing English article and post titles into natural Simplified Chinese.
Preserve genuine product, company, model, repository, and person names. For those names, return the exact original label unchanged.
Return strict JSON only with this shape: {"translations":[{"source":"exact input","translation":"Chinese label"}]}.`,
    prompt: JSON.stringify({ labels }),
  });
  const parsed = JSON.parse(response.replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(parsed.translations) || parsed.translations.length !== labels.length) {
    throw new Error("link-label repair returned an invalid translation list");
  }
  const bySource = new Map(
    parsed.translations.map((item) => [item.source, item.translation]),
  );
  const orderedTranslations = labels.map((source) => ({
    source,
    translation: bySource.get(source),
  }));
  return applyLinkLabelTranslations(translation, orderedTranslations);
}

async function translateAndReview(client, source, modelConfig) {
  const { protectedMarkdown: protectedSource, protections } = protectMarkdown(source);
  const draft = removeAddedInlineCodeMarkers(await requestMarkdown(client, {
    ...modelConfig,
    systemPrompt: TRANSLATOR_PROMPT,
    prompt: `<source_markdown>\n${protectedSource}\n</source_markdown>`,
  }));
  const draftErrors = validateTranslation(protectedSource, draft);
  if (draftErrors.length > 0) {
    throw new Error(`draft validation failed: ${draftErrors.join(", ")}`);
  }

  const reviewed = removeAddedInlineCodeMarkers(await requestMarkdown(client, {
    ...modelConfig,
    systemPrompt: REVIEWER_PROMPT,
    prompt: `<source_markdown>\n${protectedSource}\n</source_markdown>\n\n<draft_translation>\n${draft}\n</draft_translation>`,
  }));
  let finalTranslation = reviewed;
  const untranslatedLabels = untranslatedLinkLabels(finalTranslation);
  if (untranslatedLabels.length > 0) {
    finalTranslation = await repairLinkLabels(
      client,
      finalTranslation,
      untranslatedLabels,
      modelConfig,
    );
  }
  const protectedReviewErrors = validateTranslation(protectedSource, finalTranslation);
  if (protectedReviewErrors.length > 0) {
    throw new Error(`review validation failed: ${protectedReviewErrors.join(", ")}`);
  }
  finalTranslation = restoreProtectedMarkdown(finalTranslation, protections);
  const reviewErrors = validateTranslation(source, finalTranslation);
  if (reviewErrors.length > 0) {
    throw new Error(`review validation failed: ${reviewErrors.join(", ")}`);
  }

  return finalTranslation;
}

async function translateFile(client, file, options) {
  const source = await fs.readFile(file.sourcePath, "utf8");
  const attempts = [
    { model: options.model, effort: options.effort },
    { model: options.fallbackModel, effort: options.fallbackEffort },
  ].filter(
    (attempt, index, attemptsList) =>
      attemptsList.findIndex(
        (candidate) =>
          candidate.model === attempt.model && candidate.effort === attempt.effort,
      ) === index,
  );
  const failures = [];

  for (const attempt of attempts) {
    try {
      console.log(`Translating ${file.sourcePath} with ${attempt.model} (${attempt.effort})`);
      const translation = await translateAndReview(client, source, attempt);
      const temporaryPath = `${file.translationPath}.tmp`;
      await fs.mkdir(path.dirname(file.translationPath), { recursive: true });
      await fs.writeFile(temporaryPath, `${translation}\n`, "utf8");
      await fs.rename(temporaryPath, file.translationPath);
      return { ...file, model: attempt.model };
    } catch (error) {
      failures.push(`${attempt.model}: ${error.message}`);
      console.warn(`Translation attempt failed for ${file.sourcePath}: ${error.message}`);
    }
  }

  throw new Error(`Unable to translate ${file.sourcePath}: ${failures.join("; ")}`);
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;
  const results = [];

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root);
  const files = await findMissingTranslations(root, {
    force: options.force,
    resume: options.resume,
    limit: options.limit,
    outputRoot: options.outputRoot,
  });

  if (files.length === 0) {
    console.log(`No missing Chinese translations under ${root}`);
    return;
  }

  const token = process.env.COPILOT_GITHUB_TOKEN;
  const client = new CopilotClient({
    mode: "empty",
    workingDirectory: process.cwd(),
    baseDirectory: path.join(
      process.env.RUNNER_TEMP ?? os.tmpdir(),
      "vibewatch-copilot-translation",
    ),
    logLevel: "error",
    ...(token ? { gitHubToken: token, useLoggedInUser: false } : {}),
  });

  try {
    await client.start();
    const settled = await runPool(files, options.concurrency, (file) =>
      translateFile(client, file, options),
    );
    const results = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failures = settled.filter((result) => result.status === "rejected");
    const fallbackCount = results.filter((result) => result.model === options.fallbackModel).length;
    console.log(
      `Created ${results.length} translation(s); ${fallbackCount} used ${options.fallbackModel}.`,
    );
    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(failure.reason);
      }
      throw new Error(`${failures.length} translation(s) failed`);
    }
  } finally {
    await client.stop();
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  TRANSLATOR_PROMPT,
  findMissingTranslations,
  applyLinkLabelTranslations,
  protectMarkdown,
  removeAddedInlineCodeMarkers,
  restoreProtectedMarkdown,
  markdownSignature,
  parseArgs,
  validateTranslation,
  visibleLanguageRatio,
  untranslatedLinkLabels,
};

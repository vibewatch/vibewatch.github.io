import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyLinkLabelTranslations,
  findMissingTranslations,
  isIdentityLink,
  localizeReaderFacingMetrics,
  normalizeProtectedTokenWrappers,
  normalizeThematicBreakTokens,
  parseArgs,
  protectMarkdown,
  removeAddedInlineCodeMarkers,
  restoreProtectedMarkdown,
  splitMarkdownForTranslation,
  stripAddedMarkdownLinks,
  stripAddedThematicBreaks,
  translateFile,
  untranslatedLinkLabels,
  validateTranslation,
  visibleLanguageRatio,
} from "./translate-markdown.mjs";

test("parseArgs uses GPT-6 Luna for drafts, reviews, and higher-effort retries", () => {
  assert.deepEqual(parseArgs([]), {
    root: "reports",
    model: "gpt-6-luna",
    effort: "medium",
    reviewModel: "gpt-6-luna",
    reviewEffort: "medium",
    fallbackModel: "gpt-6-luna",
    fallbackEffort: "high",
    concurrency: 2,
    force: false,
    resume: false,
    limit: null,
    outputRoot: null,
  });
});

for (const retry of [false, true]) {
  test(`translation records same-model fallback accurately: retry=${retry}`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "luna-translation-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = {
      sourcePath: path.join(root, "source.md"),
      translationPath: path.join(root, "source.zh.md"),
    };
    await fs.writeFile(file.sourcePath, "Hello world.\n");
    const sessions = [];
    const client = {
      async createSession(config) {
        sessions.push(config);
        return {
          async sendAndWait() {
            if (retry && config.reasoningEffort === "medium") {
              throw new Error("Primary translation failed");
            }
            return { data: { content: "你好，世界。" } };
          },
          async disconnect() {},
        };
      },
    };
    const result = await translateFile(client, file, parseArgs([]));
    assert.equal(result.usedFallback, retry);
    assert(sessions.every((session) => session.model === "gpt-6-luna"));
    assert.equal(sessions.some((session) => session.reasoningEffort === "high"), retry);
    assert.equal(await fs.readFile(file.translationPath, "utf8"), "你好，世界。\n");
  });
}

test("translation preserves heading and paragraph boundaries across trimmed chunk responses", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "translation-chunks-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = {
    sourcePath: path.join(root, "source.md"),
    translationPath: path.join(root, "source.zh.md"),
  };
  const prefix = "# First\n\n";
  const source = `${prefix}${"A".repeat(8_000 - prefix.length - 1)}\n## Second\n\nFinal paragraph.\n`;
  const chunks = splitMarkdownForTranslation(source);
  assert.equal(chunks.length, 2);
  assert(chunks[1].startsWith("## Second"));
  await fs.writeFile(file.sourcePath, source);
  const client = {
    async createSession() {
      return {
        async sendAndWait({ prompt }) {
          const chunk = prompt.match(/<source_markdown>\n([\s\S]*?)\n<\/source_markdown>/)[1];
          return { data: { content: chunk.replace(/[A-Za-z]+/g, "译文").trim() } };
        },
        async disconnect() {},
      };
    },
  };
  await translateFile(client, file, parseArgs([]));
  const translation = await fs.readFile(file.translationPath, "utf8");
  assert.deepEqual(validateTranslation(source, translation), []);
  assert.match(translation, /译文\n## 译文\n\n译文 译文\.\n$/);
});

for (const file of ["build-source-reports-reusable.yml", "translate-reports-to-chinese.yml"]) {
  test(`workflow rejects retired models: ${file}`, async (t) => {
    const workflow = await fs.readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const match = workflow.match(/      - name: Select model effort[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      - name:)/);
    assert(match);
    const script = match[1].replace(/^          /gm, "");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "luna-workflow-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    for (const [index, model] of ["gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-sol"].entries()) {
      const output = path.join(root, `output-${index}`);
      const result = spawnSync("bash", ["-e", "-c", script], {
        encoding: "utf8",
        env: { ...process.env, COPILOT_MODEL: model, GITHUB_OUTPUT: output },
      });
      assert.equal(result.status, index === 0 ? 0 : 1, result.stderr);
      if (index === 0) {
        assert.match(await fs.readFile(output, "utf8"), /^model=gpt-6-luna$/m);
        assert.match(
          await fs.readFile(output, "utf8"),
          new RegExp(`^effort=${file === "translate-reports-to-chinese.yml" ? "medium" : "xhigh"}$`, "m"),
        );
      } else {
        assert.match(result.stdout, /Unsupported Copilot model/);
      }
    }
  });
}

test("translation workflow forwards small batch limits and preserves unlimited scheduled runs", async (t) => {
  const workflow = await fs.readFile(
    new URL("../.github/workflows/translate-reports-to-chinese.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /TRANSLATION_LIMIT: \$\{\{ inputs\.limit \}\}/);
  const block = workflow.split(/^      - name: /m).find((block) => block.startsWith("Translate reports\n"));
  const script = block.split("        run: |\n")[1]
    .replace(/^          /gm, "")
    .replace(/\$\{\{ steps\.copilot-model\.outputs\.model \}\}/g, "gpt-6-luna")
    .replace(/\$\{\{ steps\.copilot-model\.outputs\.effort \}\}/g, "medium");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "translation-batch-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [index, limit] of ["", "5", "invalid"].entries()) {
    const output = path.join(root, `args-${index}`);
    const result = spawnSync("bash", ["-e", "-c", `node() { printf '%s\\n' "$@" > "$ARGUMENTS"; }\n${script}`], {
      encoding: "utf8",
      env: { ...process.env, TRANSLATION_LIMIT: limit, ARGUMENTS: output },
    });
    assert.equal(result.status, limit === "invalid" ? 1 : 0, result.stderr);
    if (limit === "invalid") {
      await assert.rejects(fs.access(output));
    } else {
      const args = (await fs.readFile(output, "utf8")).trim().split("\n");
      assert.equal(args[args.indexOf("--effort") + 1], "medium");
      assert.equal(args[args.indexOf("--review-effort") + 1], "medium");
      assert.equal(args[args.indexOf("--fallback-effort") + 1], "high");
      assert.equal(args.includes("--limit"), limit !== "");
      if (limit) assert.equal(args[args.indexOf("--limit") + 1], limit);
    }
  }
});

for (const scenario of ["mixed", "all-failed", "success"]) {
  test(`translation workflow publishes completed files before reporting failures: ${scenario}`, async (t) => {
    const workflow = await fs.readFile(
      new URL("../.github/workflows/translate-reports-to-chinese.yml", import.meta.url),
      "utf8",
    );
    const blocks = workflow.split(/^      - name: /m).slice(1);
    const step = (name) => {
      const block = blocks.find((block) => block.startsWith(`${name}\n`));
      assert(block, `Missing step: ${name}`);
      return block;
    };
    const script = (name) => {
      const body = step(name).split("        run: |\n")[1];
      assert(body);
      return body.replace(/^          /gm, "");
    };
    assert.match(step("Translate reports"), /^        id: translation$/m);
    assert.match(step("Translate reports"), /^        continue-on-error: true$/m);
    assert.match(
      step("Report translation failures"),
      /^        if: \$\{\{ !cancelled\(\) && steps\.translation\.outcome == 'failure' \}\}$/m,
    );
    assert(blocks.indexOf(step("Report translation failures")) > blocks.indexOf(step("Push docs to website")));
    assert.doesNotMatch(step("Detect new translations"), /^        if:/m);
    for (const name of ["Push translations to harvester", "Copy translations to website", "Push docs to website"]) {
      assert.match(step(name), /^        if: steps\.check-translations\.outputs\.has_changes == 'true'$/m);
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "translation-publication-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const run = (command, args, cwd = root) => {
      const result = spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: path.join(root, "output"),
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    for (const repo of ["harvester", "website"]) {
      const checkout = path.join(root, repo);
      run("git", ["init", "--bare", `${repo}.git`]);
      run("git", ["init", "-b", "main", repo]);
      run("git", ["config", "user.name", "Fixture"], checkout);
      run("git", ["config", "user.email", "fixture@example.invalid"], checkout);
      await fs.writeFile(path.join(checkout, ".gitkeep"), "");
      await fs.mkdir(path.join(checkout, repo === "harvester" ? "reports/topic" : "docs/topic"), { recursive: true });
      run("git", ["add", "."], checkout);
      run("git", ["commit", "-m", "Initialize fixture"], checkout);
      run("git", ["remote", "add", "origin", path.join(root, `${repo}.git`)], checkout);
      run("git", ["push", "-u", "origin", "main"], checkout);
    }
    const harvester = path.join(root, "harvester");
    await fs.writeFile(path.join(harvester, "reports/topic/failed.md"), "# Untranslated source\n");
    if (scenario !== "all-failed") {
      await fs.writeFile(path.join(harvester, "reports/topic/complete.zh.md"), "Validated translation.\n");
    }
    run("bash", ["-e", "-o", "pipefail", "-c", script("Detect new translations")], harvester);
    const output = await fs.readFile(path.join(root, "output"), "utf8");
    assert.equal(output, `has_changes=${scenario !== "all-failed"}\n`);
    if (scenario !== "all-failed") {
      run("bash", ["-e", "-o", "pipefail", "-c", script("Push translations to harvester")], harvester);
      run("bash", ["-e", "-o", "pipefail", "-c", script("Copy translations to website")]);
      run("bash", ["-e", "-o", "pipefail", "-c", script("Push docs to website")], path.join(root, "website"));
    }
    for (const [repo, directory] of [["harvester", "reports"], ["website", "docs"]]) {
      const files = run("git", ["--git-dir", path.join(root, `${repo}.git`), "ls-tree", "-r", "--name-only", "main"]);
      assert.equal(files.includes(`${directory}/topic/complete.zh.md`), scenario !== "all-failed");
      assert(!files.includes("failed"), files);
    }
    if (scenario !== "success") {
      const result = spawnSync("bash", ["-e", "-c", script("Report translation failures")], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /::error::Some translations failed/);
    }
  });
}

test("findMissingTranslations excludes existing Chinese files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "translations-"));
  await fs.mkdir(path.join(root, "topic"));
  await fs.writeFile(path.join(root, "topic", "missing.md"), "# Missing\n");
  await fs.writeFile(path.join(root, "topic", "complete.md"), "# Complete\n");
  await fs.writeFile(path.join(root, "topic", "complete.zh.md"), "# 完成\n");

  const missing = await findMissingTranslations(root);

  assert.deepEqual(
    missing.map((file) => path.basename(file.sourcePath)),
    ["missing.md"],
  );
});

test("findMissingTranslations supports forced isolated retranslation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "retranslations-"));
  const outputRoot = path.join(root, "preview");
  await fs.mkdir(path.join(root, "topic"));
  await fs.writeFile(path.join(root, "topic", "one.md"), "# One\n");
  await fs.writeFile(path.join(root, "topic", "one.zh.md"), "# 一\n");
  await fs.writeFile(path.join(root, "topic", "two.md"), "# Two\n");
  await fs.writeFile(path.join(root, "topic", "two.zh.md"), "# 二\n");

  const files = await findMissingTranslations(root, {
    force: true,
    limit: 1,
    outputRoot,
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].sourcePath, path.join(root, "topic", "one.md"));
  assert.equal(files[0].translationPath, path.join(outputRoot, "topic", "one.zh.md"));
});

test("findMissingTranslations resumes an isolated retranslation batch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "resume-translations-"));
  const outputRoot = path.join(root, "preview");
  await fs.mkdir(path.join(root, "topic"));
  await fs.mkdir(path.join(outputRoot, "topic"), { recursive: true });
  await fs.writeFile(path.join(root, "topic", "done.md"), "# Done\n");
  await fs.writeFile(path.join(root, "topic", "pending.md"), "# Pending\n");
  await fs.writeFile(path.join(outputRoot, "topic", "done.zh.md"), "# 完成\n");

  const files = await findMissingTranslations(root, {
    force: true,
    resume: true,
    outputRoot,
  });

  assert.deepEqual(
    files.map((file) => path.basename(file.sourcePath)),
    ["pending.md"],
  );
});

test("validateTranslation accepts translated prose with preserved Markdown", () => {
  const source =
    "# Report\n\nRead [the story](https://example.com/a) with **care** and `npm test`.\n";
  const translation =
    "# 报告\n\n请仔细阅读[这篇报道](https://example.com/a)，并运行 **检查** 与 `npm test`。\n";

  assert.deepEqual(validateTranslation(source, translation), []);
});

test("validateTranslation handles nested brackets and parentheses in links", () => {
  const source =
    "# Report\n\nRead [Launch HN: Acme [YC S26]](https://example.com/post_(one)).\n";
  const translation =
    "# 报告\n\n阅读[Acme 发布于 HN［YC S26］](https://example.com/post_(one))。\n";

  assert.deepEqual(validateTranslation(source, translation), []);
});

test("validateTranslation rejects changed URLs and untranslated prose", () => {
  const source = "# Report\n\nRead [the story](https://example.com/a) carefully.\n";
  const translation =
    "# Report\n\nRead [the story](https://example.com/b) carefully without translating it.\n";
  const errors = validateTranslation(source, translation);

  assert.ok(errors.includes("urls changed"));
  assert.ok(errors.includes("too much reader-facing English remains"));
});

test("validateTranslation does not treat censored words as bold Markdown", () => {
  const source = "GitHub needs to get their s*** together.";
  const translation = "GitHub 真该把这些破事处理好了。";

  assert.deepEqual(validateTranslation(source, translation), []);
});

test("visibleLanguageRatio ignores URLs and code", () => {
  const ratio = visibleLanguageRatio(
    "这是自然的中文内容，请查看 [GitHub](https://github.com/example/project) 并运行 `npm test`。",
  );

  assert.ok(ratio > 0.7);
});

test("protectMarkdown round-trips URLs and code exactly", () => {
  const markdown =
    "Read [the report](https://example.com/a?x=1) and run `npm test`.\n\n```js\nconsole.log('ok');\n```\n";
  const { protectedMarkdown, protections } = protectMarkdown(markdown);
  const link = protections.find((protection) => protection.kind === "link");

  assert.doesNotMatch(
    protectedMarkdown,
    /the report|https:\/\/example\.com|npm test|console\.log/,
  );
  assert.equal(
    restoreProtectedMarkdown(
      protectedMarkdown,
      protections,
      new Map([[link.token, "这篇报告"]]),
    ),
    "Read [这篇报告](https://example.com/a?x=1) and run `npm test`.\n\n```js\nconsole.log('ok');\n```\n",
  );
});

test("protectMarkdown preserves thematic breaks exactly", () => {
  const markdown = "# Report\n\nIntroduction.\n\n---\n\n## Details\n";
  const { protectedMarkdown, protections } = protectMarkdown(markdown);

  assert.doesNotMatch(protectedMarkdown, /^---$/m);
  assert.equal(restoreProtectedMarkdown(protectedMarkdown, protections), markdown);
});

test("normalizeThematicBreakTokens restores separators moved inline", () => {
  const markdown = "Before.\n\n---\n\nAfter.";
  const { protectedMarkdown, protections } = protectMarkdown(markdown);
  const thematicBreak = protections.find(
    (protection) => protection.kind === "thematic-break",
  );
  const movedInline = protectedMarkdown
    .replace(/\n+/g, " ")
    .replace(thematicBreak.token, `text ${thematicBreak.token} text`);
  const normalized = normalizeThematicBreakTokens(movedInline, protections);
  const restored = restoreProtectedMarkdown(normalized, protections);

  assert.equal((restored.match(/^---$/gm) ?? []).length, 1);
});

test("protectMarkdown restores inline code nested inside a link label", () => {
  const markdown = "Read [the `agent-reliability` guide](https://example.com/guide).";
  const { protectedMarkdown, protections } = protectMarkdown(markdown);
  const link = protections.find((protection) => protection.kind === "link");

  assert.equal(
    restoreProtectedMarkdown(
      protectedMarkdown,
      protections,
      new Map([[link.token, "阅读 VIBEWATCHPROTECTEDTOKEN000000 指南"]]),
    ),
    "Read [阅读 `agent-reliability` 指南](https://example.com/guide).",
  );
});

test("isIdentityLink recognizes user profile links", () => {
  assert.equal(
    isIdentityLink("https://news.ycombinator.com/user?id=forks"),
    true,
  );
  assert.equal(isIdentityLink("https://www.reddit.com/user/example"), true);
  assert.equal(isIdentityLink("https://x.com/example"), true);
  assert.equal(isIdentityLink("https://x.com/example/status/123"), false);
});

test("restoreProtectedMarkdown rejects missing tokens", () => {
  const { protections } = protectMarkdown("Run `npm test`.");

  assert.throws(
    () => restoreProtectedMarkdown("运行测试。", protections),
    /occurred 0 times instead of once/,
  );
});

test("splitMarkdownForTranslation round-trips content and limits token batches", () => {
  const markdown = Array.from(
    { length: 7 },
    (_, index) =>
      `Paragraph ${index} VIBEWATCHPROTECTEDTOKEN${String(index).padStart(6, "0")}`,
  ).join("\n\n");
  const chunks = splitMarkdownForTranslation(markdown, 10_000, 3);

  assert.equal(chunks.join(""), markdown);
  assert.deepEqual(
    chunks.map(
      (chunk) => (chunk.match(/VIBEWATCHPROTECTEDTOKEN\d{6}/g) ?? []).length,
    ),
    [3, 3, 1],
  );
});

test("removeAddedInlineCodeMarkers removes model-added formatting", () => {
  assert.equal(
    removeAddedInlineCodeMarkers("使用 `MCP` 和 ``agent loop``。"),
    "使用 MCP 和 agent loop。",
  );
});

test("localizeReaderFacingMetrics translates common social metrics", () => {
  assert.equal(
    localizeReaderFacingMetrics(
      "(176 points, 150 comments, score 0, 2 likes, 1 reply, 3 views, 4 bookmarks)",
    ),
    "(176 分, 150 条评论, 得分 0, 2 次点赞, 1 条回复, 3 次浏览, 4 次收藏)",
  );
});

test("normalizeProtectedTokenWrappers removes model-added links", () => {
  const protections = [
    {
      token: "VIBEWATCHPROTECTEDTOKEN000001",
      kind: "link",
      label: "Report",
      destination: "https://example.com",
      image: false,
    },
  ];

  assert.equal(
    normalizeProtectedTokenWrappers(
      '阅读[报告]( <VIBEWATCHPROTECTEDTOKEN000001> "来源" )。',
      protections,
    ),
    "阅读VIBEWATCHPROTECTEDTOKEN000001。",
  );
});

test("stripAddedMarkdownLinks discards invented destinations", () => {
  assert.equal(
    stripAddedMarkdownLinks(
      "参见[额外说明](https://invented.example/path)和正文。",
      [],
    ),
    "参见额外说明和正文。",
  );
});

test("stripAddedThematicBreaks removes model-invented separators", () => {
  assert.equal(
    stripAddedThematicBreaks(
      "第一段。\n\n---\n\nVIBEWATCHPROTECTEDTOKEN000001\n\n第二段。\n",
    ),
    "第一段。\n\n\nVIBEWATCHPROTECTEDTOKEN000001\n\n第二段。\n",
  );
});

test("untranslatedLinkLabels flags sentence-like English titles", () => {
  const markdown =
    "[What verification patterns are you using?](https://example.com) and [Claude Code](https://example.com/claude)";

  assert.deepEqual(untranslatedLinkLabels(markdown), [
    "What verification patterns are you using?",
  ]);
});

test("applyLinkLabelTranslations changes labels without changing URLs", () => {
  const markdown =
    "Read [What builders learned](https://example.com/report) and [Claude Code](https://example.com/claude).";
  const repaired = applyLinkLabelTranslations(markdown, [
    { source: "What builders learned", translation: "构建者学到了什么" },
  ]);

  assert.equal(
    repaired,
    "Read [构建者学到了什么](https://example.com/report) and [Claude Code](https://example.com/claude).",
  );
});

test("applyLinkLabelTranslations preserves genuine product names", () => {
  const markdown =
    "[Third Reality Voice/Music Assistant Dev Edition](https://example.com/product)";

  assert.equal(
    applyLinkLabelTranslations(markdown, [
      {
        source: "Third Reality Voice/Music Assistant Dev Edition",
        translation: "Third Reality Voice/Music Assistant Dev Edition",
      },
    ]),
    markdown,
  );
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyLinkLabelTranslations,
  findMissingTranslations,
  parseArgs,
  protectMarkdown,
  removeAddedInlineCodeMarkers,
  restoreProtectedMarkdown,
  untranslatedLinkLabels,
  validateTranslation,
  visibleLanguageRatio,
} from "./translate-markdown.mjs";

test("parseArgs uses the best quality-cost default model", () => {
  assert.deepEqual(parseArgs([]), {
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
  });
});

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

test("validateTranslation rejects changed URLs and untranslated prose", () => {
  const source = "# Report\n\nRead [the story](https://example.com/a) carefully.\n";
  const translation =
    "# Report\n\nRead [the story](https://example.com/b) carefully without translating it.\n";
  const errors = validateTranslation(source, translation);

  assert.ok(errors.includes("urls changed"));
  assert.ok(errors.includes("too much reader-facing English remains"));
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

  assert.doesNotMatch(protectedMarkdown, /https:\/\/example\.com|npm test|console\.log/);
  assert.equal(restoreProtectedMarkdown(protectedMarkdown, protections), markdown);
});

test("restoreProtectedMarkdown rejects missing tokens", () => {
  const { protections } = protectMarkdown("Run `npm test`.");

  assert.throws(
    () => restoreProtectedMarkdown("运行测试。", protections),
    /occurred 0 times instead of once/,
  );
});

test("removeAddedInlineCodeMarkers removes model-added formatting", () => {
  assert.equal(
    removeAddedInlineCodeMarkers("使用 `MCP` 和 ``agent loop``。"),
    "使用 MCP 和 agent loop。",
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

import assert from "node:assert/strict";
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
  parseArgs,
  protectMarkdown,
  removeAddedInlineCodeMarkers,
  restoreProtectedMarkdown,
  splitMarkdownForTranslation,
  stripAddedMarkdownLinks,
  untranslatedLinkLabels,
  validateTranslation,
  visibleLanguageRatio,
} from "./translate-markdown.mjs";

test("parseArgs uses the best quality-cost default model", () => {
  assert.deepEqual(parseArgs([]), {
    root: "reports",
    model: "gpt-5.6-luna",
    effort: "none",
    reviewModel: "gpt-5.4",
    reviewEffort: "low",
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "./worker.js";

const schedules = [
  ["build-hackernews-reports.yml", "01:00"],
  ["build-youtube-reports.yml", "01:30"],
  ["build-reddit-reports.yml", "02:00"],
  ["build-twitter-reports.yml", "03:00"],
  ["translate-reports-to-chinese.yml", "04:00"],
];

const env = {
  GITHUB_TOKEN: "fixture-token",
  GITHUB_REPO: "vibewatch/vibewatch.github.io",
};

function eventAt(time) {
  return { scheduledTime: Date.parse(`2026-10-26T${time}:00Z`) };
}

function mockDispatch(t, respond = () => new Response(null, { status: 204 })) {
  const calls = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options, payload: JSON.parse(options.body) });
    return respond();
  });
  return calls;
}

for (const [workflow, time] of schedules) {
  test(`${workflow} dispatches exactly once at ${time} UTC with Luna`, async (t) => {
    const calls = mockDispatch(t);
    await worker.scheduled(eventAt(time), env);
    assert.equal(calls.length, 1);
    const { url, options, payload } = calls[0];
    assert.equal(
      url,
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
    );
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${env.GITHUB_TOKEN}`);
    assert.equal(options.headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.deepEqual(payload, { ref: "main", inputs: { model: "gpt-6-luna" } });
  });

  test(`${workflow} accepts the Worker's model and has no duplicate native schedule`, async () => {
    const source = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), "utf8");
    assert.match(source, /^  workflow_dispatch:/m);
    assert.doesNotMatch(source, /^  schedule:/m);
    assert.match(source, /cancel-in-progress: false/);
    const input = source.match(/^      model:\n([\s\S]*?)(?=^\S)/m)?.[1];
    assert(input);
    assert.match(input, /^        default: gpt-6-luna$/m);
    assert.match(input, /^        type: choice$/m);
    const options = input.match(/^        options:\n((?:          - .*\n)+)/m)?.[1];
    assert(options);
    assert.deepEqual(
      options.trim().split("\n").map((line) => line.trim().slice(2)),
      ["gpt-6-luna"],
    );
    if (workflow.startsWith("build-")) {
      assert.match(source, /uses: \.\/\.github\/workflows\/build-source-reports-reusable.yml/);
      assert.match(source, /COPILOT_PAT: \$\{\{ secrets\.COPILOT_GITHUB_TOKEN \}\}/);
    } else {
      assert.match(source, /COPILOT_GITHUB_TOKEN: \$\{\{ secrets\.COPILOT_GITHUB_TOKEN \}\}/);
    }
  });
}

test("Wrangler targets the active repository and covers all five daily dispatch times", async () => {
  const config = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /^GITHUB_REPO = "vibewatch\/vibewatch.github.io"$/m);
  assert.deepEqual(
    JSON.parse(config.match(/^crons = (\[.*\])$/m)?.[1]),
    ["0 1-4 * * *", "30 1 * * *"],
  );
  assert.doesNotMatch(config, /^(?:WORKFLOW_MODEL|MODEL_\w+)\s*=/m);
});

test("legacy deployment model variables cannot change the pinned dispatch model", async (t) => {
  const calls = mockDispatch(t);
  const overrides = {
    WORKFLOW_MODEL: "gpt-5.4",
    MODEL_HACKERNEWS: "claude-opus-4.6",
    MODEL_YOUTUBE: "gpt-5.5",
    MODEL_REDDIT: "gpt-6-sol",
    MODEL_TWITTER: "grok-4.7",
    MODEL_TRANSLATE: "claude-sonnet-4.6",
  };
  for (const [, time] of schedules) {
    await worker.scheduled(eventAt(time), { ...env, ...overrides });
  }
  assert.equal(calls.length, schedules.length);
  assert(calls.every(({ payload }) => payload.inputs.model === "gpt-6-luna"));
});

test("an explicit Git ref is forwarded unchanged", async (t) => {
  const calls = mockDispatch(t);
  await worker.scheduled(eventAt("01:00"), { ...env, GITHUB_REF: "release" });
  assert.equal(calls[0].payload.ref, "release");
});

test("unscheduled minutes do not dispatch or require credentials", async (t) => {
  const calls = mockDispatch(t);
  for (const time of ["00:00", "01:01", "02:30", "04:30", "12:00"]) {
    await worker.scheduled(eventAt(time), {});
  }
  assert.equal(calls.length, 0);
});

for (const name of ["GITHUB_TOKEN", "GITHUB_REPO"]) {
  test(`missing ${name} fails before making a request`, async (t) => {
    const calls = mockDispatch(t);
    const missing = { ...env };
    delete missing[name];
    await assert.rejects(worker.scheduled(eventAt("01:00"), missing), {
      message: `Missing required environment variable: ${name}`,
    });
    assert.equal(calls.length, 0);
  });
}

test("GitHub HTTP failures fail the Worker invocation and identify the workflow", async (t) => {
  mockDispatch(t, () => new Response("Bad credentials", { status: 401 }));
  await assert.rejects(worker.scheduled(eventAt("01:00"), env), (error) => {
    assert(error instanceof AggregateError);
    assert.match(error.errors[0].message, /HTTP 401: Bad credentials/);
    return true;
  });
  const errors = console.error.mock.calls;
  assert.equal(errors.length, 1);
  assert.match(errors[0].arguments[0], /Failed to dispatch build-hackernews-reports.yml/);
});

test("network failures are logged and fail the Worker invocation", async (t) => {
  mockDispatch(t, () => {
    throw new Error("Network unavailable");
  });
  await assert.rejects(worker.scheduled(eventAt("01:00"), env), (error) => {
    assert(error instanceof AggregateError);
    assert.equal(error.errors[0].message, "Network unavailable");
    return true;
  });
  assert.equal(console.error.mock.calls.length, 1);
});

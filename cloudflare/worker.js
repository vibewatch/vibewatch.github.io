/**
 * AI Pulse Daily Scheduler - Cloudflare Worker
 *
 * Cloudflare Cron Triggers fire at the exact UTC times used by the website's
 * disabled GitHub Actions schedules, and this Worker dispatches the matching workflow.
 *
 * Required secret (set via `wrangler secret put`):
 *   GITHUB_TOKEN - Fine-grained PAT with Actions: Read & Write on the target repo

 * Required Worker var:
 *   GITHUB_REPO  - Owner/repo string, e.g. "vibewatch/vibewatch.github.io"
 *
 * Optional Worker vars:
 *   GITHUB_REF        - Git ref to dispatch, defaults to "main"
 *   WORKFLOW_MODEL    - Default Copilot model for every workflow (default "gpt-5.4")
 *   MODEL_HACKERNEWS  - Override model for build-hackernews-reports.yml
 *   MODEL_YOUTUBE     - Override model for build-youtube-reports.yml
 *   MODEL_REDDIT      - Override model for build-reddit-reports.yml
 *   MODEL_TWITTER     - Override model for build-twitter-reports.yml
 *   MODEL_TRANSLATE   - Override model for translate-reports-to-chinese.yml
 *
 * Allowed models (must match the workflow_dispatch choice list):
 *   gpt-5.4, gpt-5.5, claude-opus-4.6, claude-sonnet-4.6
 *
 * Schedule reference:
 *   build-hackernews-reports.yml      0  1 * * *
 *   build-youtube-reports.yml         30 1 * * *
 *   build-reddit-reports.yml          0  2 * * *
 *   build-twitter-reports.yml         0  3 * * *
 *   translate-reports-to-chinese.yml  0  4 * * *
 */

const ALLOWED_MODELS = [
  "gpt-5.4",
  "gpt-5.5",
  "claude-opus-4.6",
  "claude-sonnet-4.6",
];

const DEFAULT_MODEL = "gpt-5.4";

const WORKFLOW_SCHEDULE = [
  { workflow: "build-hackernews-reports.yml", hour: 1, minute: 0, modelEnv: "MODEL_HACKERNEWS" },
  { workflow: "build-youtube-reports.yml", hour: 1, minute: 30, modelEnv: "MODEL_YOUTUBE" },
  { workflow: "build-reddit-reports.yml", hour: 2, minute: 0, modelEnv: "MODEL_REDDIT" },
  { workflow: "build-twitter-reports.yml", hour: 3, minute: 0, modelEnv: "MODEL_TWITTER" },
  { workflow: "translate-reports-to-chinese.yml", hour: 4, minute: 0, modelEnv: "MODEL_TRANSLATE" },
];

export default {
  async scheduled(event, env, _ctx) {
    const now = new Date(event.scheduledTime);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    const dueEntries = WORKFLOW_SCHEDULE.filter(
      (entry) => entry.hour === hour && entry.minute === minute,
    );

    if (dueEntries.length === 0) return;

    const token = requireEnv(env.GITHUB_TOKEN, "GITHUB_TOKEN");
    const repo = requireEnv(env.GITHUB_REPO, "GITHUB_REPO");
    const ref = env.GITHUB_REF || "main";

    const dispatches = dueEntries.map((entry) => ({
      workflow: entry.workflow,
      inputs: { model: resolveModel(env, entry) },
    }));

    for (const { workflow, inputs } of dispatches) {
      console.log(
        `[${now.toISOString()}] Dispatching ${workflow} on ${ref} with model=${inputs.model}`,
      );
    }

    const dispatchResults = await Promise.allSettled(
      dispatches.map(({ workflow, inputs }) =>
        dispatchWorkflow(token, repo, workflow, ref, inputs),
      ),
    );

    for (let index = 0; index < dispatchResults.length; index++) {
      const result = dispatchResults[index];
      const { workflow } = dispatches[index];

      if (result.status === "rejected") {
        console.error(`Failed to dispatch ${workflow}: ${result.reason}`);
      } else {
        console.log(`Dispatched ${workflow} OK`);
      }
    }
  },
};

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function resolveModel(env, entry) {
  const override = entry.modelEnv ? env[entry.modelEnv] : undefined;
  const source = override
    ? entry.modelEnv
    : env.WORKFLOW_MODEL
      ? "WORKFLOW_MODEL"
      : "DEFAULT_MODEL";
  const model = String(override || env.WORKFLOW_MODEL || DEFAULT_MODEL);

  if (!ALLOWED_MODELS.includes(model)) {
    throw new Error(
      `Invalid model ${JSON.stringify(model)} for ${entry.workflow} (from ${source}); allowed: ${ALLOWED_MODELS.join(", ")}`,
    );
  }

  return model;
}

async function dispatchWorkflow(token, repo, workflow, ref, inputs) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "ai-pulse-daily-cloudflare-scheduler",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
}
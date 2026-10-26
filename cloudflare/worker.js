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
 *
 * Copilot model is pinned to gpt-6-luna, matching every workflow_dispatch choice list.
 *
 * Schedule reference:
 *   build-hackernews-reports.yml      0  1 * * *
 *   build-youtube-reports.yml         30 1 * * *
 *   build-reddit-reports.yml          0  2 * * *
 *   build-twitter-reports.yml         0  3 * * *
 *   translate-reports-to-chinese.yml  0  4 * * *
 */

const COPILOT_MODEL = "gpt-6-luna";

const WORKFLOW_SCHEDULE = [
  { workflow: "build-hackernews-reports.yml", hour: 1, minute: 0 },
  { workflow: "build-youtube-reports.yml", hour: 1, minute: 30 },
  { workflow: "build-reddit-reports.yml", hour: 2, minute: 0 },
  { workflow: "build-twitter-reports.yml", hour: 3, minute: 0 },
  { workflow: "translate-reports-to-chinese.yml", hour: 4, minute: 0 },
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
      inputs: { model: COPILOT_MODEL },
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

    const failures = [];
    for (let index = 0; index < dispatchResults.length; index++) {
      const result = dispatchResults[index];
      const { workflow } = dispatches[index];

      if (result.status === "rejected") {
        console.error(`Failed to dispatch ${workflow}: ${result.reason}`);
        failures.push(result.reason);
      } else {
        console.log(`Dispatched ${workflow} OK`);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "One or more workflow dispatches failed");
    }
  },
};

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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
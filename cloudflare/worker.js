/**
 * AI Pulse Daily Scheduler - Cloudflare Worker
 *
 * Cloudflare Cron Triggers fire at the exact UTC times used by the website's
 * disabled GitHub Actions schedules, and this Worker dispatches the matching workflow.
 *
 * Required secrets (set via `wrangler secret put`):
 *   GITHUB_TOKEN - Fine-grained PAT with Actions: Read & Write on the target repo
 *   GITHUB_REPO  - Owner/repo string, e.g. "vibewatch/vibewatch.github.io"
 *
 * Optional secret:
 *   GITHUB_REF   - Git ref to dispatch, defaults to "main"
 *
 * Schedule reference:
 *   build-hackernews-reports.yml      0  1 * * *
 *   build-youtube-reports.yml         30 1 * * *
 *   build-reddit-reports.yml          0  2 * * *
 *   build-twitter-reports.yml         0  3 * * *
 *   translate-reports-to-chinese.yml  0  4 * * *
 */

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

    const workflowsToDispatch = WORKFLOW_SCHEDULE
      .filter((entry) => entry.hour === hour && entry.minute === minute)
      .map((entry) => entry.workflow);

    if (workflowsToDispatch.length === 0) return;

    const token = requireEnv(env.GITHUB_TOKEN, "GITHUB_TOKEN");
    const repo = requireEnv(env.GITHUB_REPO, "GITHUB_REPO");
    const ref = env.GITHUB_REF || "main";

    console.log(`[${now.toISOString()}] Dispatching: ${workflowsToDispatch.join(", ")}`);

    const dispatchResults = await Promise.allSettled(
      workflowsToDispatch.map((workflow) => dispatchWorkflow(token, repo, workflow, ref))
    );

    for (let index = 0; index < dispatchResults.length; index++) {
      const result = dispatchResults[index];
      const workflow = workflowsToDispatch[index];

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

async function dispatchWorkflow(token, repo, workflow, ref) {
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
    body: JSON.stringify({ ref }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
}
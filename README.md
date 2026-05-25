# AI Pulse Daily

AI Pulse Daily — surfacing themes, pain points, and emerging topics from the social web.

## Overview

This project powers [genisisiq.com](https://genisisiq.com/), a static site that publishes daily analysis reports from social media platforms. Reports are auto-discovered from date-named Markdown files and presented with interactive calendars and topic cards. The site is bilingual (English + Simplified Chinese) and ships with a built-in search index and RSS feed.

## Tech Stack

- **[MkDocs Material](https://squidfunk.github.io/mkdocs-material/)** — static site generator with custom theme overrides
- **Plugins** — `awesome-pages`, `macros`, `static-i18n`
- **[Pagefind](https://pagefind.app/)** — client-side search (built via a custom hook)
- **Python ≥ 3.12**

## Data Sources

| Source | Topic | Path |
|--------|-------|------|
| Reddit | AI | `docs/reddit/ai/` |
| Reddit | AI Agent | `docs/reddit/ai-agent/` |
| Reddit | AI Coding | `docs/reddit/ai-coding/` |
| Twitter | AI | `docs/twitter/ai/` |
| Twitter | AI Agent | `docs/twitter/ai-agent/` |
| Twitter | AI Coding | `docs/twitter/ai-coding/` |
| HackerNews | AI | `docs/hackernews/ai/` |
| YouTube | AI | `docs/youtube/ai/` |

## Project Structure

```
docs/
├── index.md / index.zh.md     # Bilingual homepage with topic cards and latest reports
├── stylesheets/extra.css      # Custom design system
├── javascripts/               # External-link, subscribe, and Pagefind init scripts
├── reddit/<topic>/            # Reddit daily reports (YYYY-MM-DD.md + .zh.md)
├── twitter/<topic>/           # Twitter daily reports
├── hackernews/<topic>/        # HackerNews daily reports
└── youtube/<topic>/           # YouTube daily reports
main.py                        # Jinja macros (list_reports, report_calendar, etc.)
hooks/
├── title.py                   # Auto-sets page title from date filenames
├── rss.py                     # Generates an RSS feed of recent reports
├── nav_prune.py               # Trims the navigation tree
└── pagefind_index.py          # Runs Pagefind on the built site
overrides/                     # MkDocs Material theme overrides
mkdocs.yml                     # Site configuration (i18n, sources, topics)
```

## Adding Content

Create a new date-named Markdown file under `docs/<source>/<topic>/` (e.g., `docs/reddit/ai-agent/2026-04-12.md`). The macros auto-discover it — no config changes needed. Chinese translations live alongside the English file with a `.zh.md` suffix and are wired up by the `static-i18n` plugin.

## Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `deploy-site.yml` | Push to `main` (docs/config changes) | Builds the MkDocs site, deploys it to GitHub Pages, and notifies subscribers when new report files are added. |
| `build-reddit-reports.yml` | Cloudflare / manual | Generates daily Reddit analysis reports and syncs them into `docs/reddit/`. |
| `build-twitter-reports.yml` | Cloudflare / manual | Generates daily Twitter analysis reports and syncs them into `docs/twitter/`. |
| `build-hackernews-reports.yml` | Cloudflare / manual | Generates daily HackerNews analysis reports and syncs them into `docs/hackernews/`. |
| `build-youtube-reports.yml` | Cloudflare / manual | Generates daily YouTube analysis reports and syncs them into `docs/youtube/`. |
| `build-source-reports-reusable.yml` | Reusable workflow | Shared implementation for English source report generation and website sync. Excludes `.zh.md` translations. |
| `translate-reports-to-chinese.yml` | Cloudflare / manual | Translates English reports into Chinese (`.zh.md`) and syncs them into `docs/`. |

### Cloudflare Scheduler

The `cloudflare/` Worker owns the cron schedule and dispatches the report workflows through the GitHub Actions API. Native GitHub Actions `schedule` triggers are left commented in the workflow files as references, while `workflow_dispatch` remains the execution entrypoint.

From `cloudflare/`, deploy it with Wrangler:

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Use a fine-grained GitHub PAT with **Actions: Read & Write** access on `vibewatch/vibewatch.github.io`. `GITHUB_REPO` is stored as a non-sensitive Worker var in `cloudflare/wrangler.toml`. `GITHUB_REF` is optional, defaults to `main`, and can also be set as a Worker var if dispatches need to target another ref.

### Report Generation Pipeline

The English source workflows (`build-reddit-reports`, `build-twitter-reports`, `build-hackernews-reports`, `build-youtube-reports`) call `build-source-reports-reusable.yml` with source-specific inputs. The shared workflow follows this pattern:

1. Fetch raw JSON data collected from the source platform.
2. Generate or translate Markdown reports using **Copilot CLI**.
3. Copy the new English Markdown files into this repo's `docs/` directory, excluding `.zh.md` translations.
4. Push to `main`, which triggers the `deploy-site.yml` deploy workflow.

The `translate-reports-to-chinese.yml` workflow handles `.zh.md` translations separately.

### Newsletter Notification

The `notify-subscribers` job in `deploy-site.yml` runs after deployment on push events:

1. Compares `HEAD~1..HEAD` to detect **newly added** English report files (excludes `.zh.md` translations and non-date filenames like `index.md`).
2. Runs `scripts/build_newsletter_digest.py` to render an inline-styled HTML digest with one card per new report (linked title, source · topic · date meta line, one-paragraph description sourced from the same section-1 topic extraction used by the RSS feed, and a "Read full report" link). The renderer caps the body around 80 KB and appends an overflow line when more reports exist than fit.
3. Sends the digest to subscribers via the newsletter worker's `/api/send` endpoint.

Newsletter delivery is optional: the job skips sending when newsletter secrets are missing, and notification delivery errors do not fail the site deployment. Render a dry-run digest locally with `printf '%s\n' path/to/report.md | python3 scripts/build_newsletter_digest.py > /tmp/digest.html`.

## Development

```bash
pip install -e .
mkdocs serve
```

## Deployment

Built to `site/` and deployed to GitHub Pages at [genisisiq.com](https://genisisiq.com/).

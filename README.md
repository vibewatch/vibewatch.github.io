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
| `gh-pages.yml` | Push to `main` (docs/config changes) | Builds the site with MkDocs and deploys to GitHub Pages. Sends a newsletter notification when new report files are added. |
| `reddit-reports.yml` | Scheduled / manual | Generates daily Reddit analysis reports. |
| `twitter-reports.yml` | Scheduled / manual | Generates daily Twitter analysis reports. |
| `hackernews-reports.yml` | Scheduled / manual | Generates daily HackerNews analysis reports. |
| `youtube-reports.yml` | Scheduled / manual | Generates daily YouTube analysis reports. |
| `translate-reports.yml` | Scheduled / manual | Translates English reports into Chinese (`.zh.md`). |

### Report Generation Pipeline

The report workflows (`reddit-reports`, `twitter-reports`, `hackernews-reports`, `youtube-reports`, `translate-reports`) follow the same pattern:

1. Fetch raw JSON data collected from the source platform.
2. Generate or translate Markdown reports using **Copilot CLI**.
3. Copy the new Markdown files into this repo's `docs/` directory.
4. Push to `main`, which triggers the `gh-pages.yml` deploy workflow.

### Newsletter Notification

The `notify` job in `gh-pages.yml` runs after deployment on push events:

1. Compares `HEAD~1..HEAD` to detect **newly added** English report files (excludes `.zh.md` translations).
2. Builds an HTML email with links to each new report on `genisisiq.com`.
3. Sends the email to subscribers via a newsletter worker API.

## Development

```bash
pip install -e .
mkdocs serve
```

## Deployment

Built to `site/` and deployed to GitHub Pages at [genisisiq.com](https://genisisiq.com/).

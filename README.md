# AI Pulse Daily

AI Pulse Daily — surfacing themes, pain points, and emerging topics from the social web.

## Overview

This project powers [genisisiq.com](https://genisisiq.com/), a static site that publishes daily analysis reports from social media platforms. Reports are auto-discovered from date-named Markdown files and presented with interactive calendars and topic cards.

## Tech Stack

- **[MkDocs Material](https://squidfunk.github.io/mkdocs-material/)** — static site generator with custom theme overrides
- **Plugins** — `search`, `awesome-pages`, `macros`
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

## Project Structure

```
docs/
├── index.md                # Homepage with topic cards and latest reports
├── stylesheets/extra.css   # Custom design system
├── reddit/
│   ├── ai/                 # Reddit AI daily reports (YYYY-MM-DD.md)
│   ├── ai-agent/           # Reddit AI Agent daily reports
│   └── ai-coding/          # Reddit AI Coding daily reports
└── twitter/
    ├── ai/                 # Twitter AI daily reports (YYYY-MM-DD.md)
    ├── ai-agent/           # Twitter AI Agent daily reports
    └── ai-coding/          # Twitter AI Coding daily reports
main.py                     # Jinja macros (list_reports, report_calendar, etc.)
hooks/title.py              # Auto-sets page title from date filenames
overrides/                  # MkDocs Material theme overrides
mkdocs.yml                  # Site configuration
```

## Adding Content

Create a new date-named Markdown file under `docs/<source>/<topic>/` (e.g., `docs/reddit/ai-agent/2026-04-12.md`). The macros auto-discover it — no config changes needed.

## Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `gh-pages.yml` | Push to `main` (docs/config changes) | Builds the site with MkDocs and deploys to GitHub Pages. Sends a newsletter notification when new report files are added. |
| `reddit-reports.yml` | Scheduled (02:00 UTC) / manual | Generates daily Reddit analysis reports. |
| `twitter-reports.yml` | Scheduled (03:00 UTC) / manual | Generates daily Twitter analysis reports. |
| `translate-reports.yml` | Scheduled (04:00 UTC) / manual | Translates English reports into Chinese. |

### Report Generation Pipeline

The three report workflows (`reddit-reports`, `twitter-reports`, `translate-reports`) follow the same pattern:

1. Fetch raw JSON data collected from social platforms.
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

# Daily Social Signals

Daily social signal briefings — surfacing themes, pain points, and emerging topics from the social web.

## Overview

This project powers [vibewatch.github.io](https://vibewatch.github.io/), a static site that publishes daily analysis reports from social media platforms. Reports are auto-discovered from date-named Markdown files and presented with interactive calendars and topic cards.

## Tech Stack

- **[MkDocs Material](https://squidfunk.github.io/mkdocs-material/)** — static site generator with custom theme overrides
- **Plugins** — `search`, `awesome-pages`, `macros`
- **Python ≥ 3.12**

## Data Sources

| Source | Topic | Path |
|--------|-------|------|
| Reddit | AI Agents | `docs/reddit/ai-agent/` |
| Twitter | AI Agents | `docs/twitter/ai-agent/` |

## Project Structure

```
docs/
├── index.md                # Homepage with topic cards and latest reports
├── stylesheets/extra.css   # Custom design system
├── reddit/ai-agent/        # Reddit daily reports (YYYY-MM-DD.md)
└── twitter/ai-agent/       # Twitter daily reports (YYYY-MM-DD.md)
main.py                     # Jinja macros (list_reports, report_calendar, etc.)
hooks/title.py              # Auto-sets page title from date filenames
overrides/                  # MkDocs Material theme overrides
mkdocs.yml                  # Site configuration
```

## Adding Content

Create a new date-named Markdown file under `docs/<source>/<topic>/` (e.g., `docs/reddit/ai-agent/2026-04-12.md`). The macros auto-discover it — no config changes needed.

## Development

```bash
pip install -e .
mkdocs serve
```

## Deployment

Built to `site/` and deployed to GitHub Pages at [vibewatch.github.io](https://vibewatch.github.io/).

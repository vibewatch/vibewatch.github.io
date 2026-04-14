"""MkDocs hook: set nav title and article meta for date-named pages."""

import re

_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})(\.zh)?")


def on_page_read_source(page, config):
    stem = page.file.name.removesuffix(".md")
    m = _DATE_RE.fullmatch(stem)
    if m:
        page.title = m.group(1)


def on_page_markdown(markdown, page, config, files):
    """Extract description, og:image, author, and date from report pages."""
    stem = page.file.name.removesuffix(".md")
    m = _DATE_RE.fullmatch(stem)
    if not m:
        return markdown

    date_str = m.group(1)

    # Derive source/topic labels from path  (e.g. "reddit/ai-agent/…")
    parts = page.file.src_path.split("/")
    source_label = parts[0].title() if len(parts) >= 3 else ""
    topic_label = (
        parts[1].replace("-", " ").title() if len(parts) >= 3 else ""
    )

    # --- description: section-1 sub-topic titles joined ---------------
    topics = _extract_section1_topics(markdown)
    if topics:
        description = (
            f"{source_label} {topic_label} — {date_str}: "
            + " · ".join(topics)
        )
    else:
        description = f"{source_label} {topic_label} report for {date_str}"

    # --- first image → og:image --------------------------------------
    first_image = _extract_first_image(markdown)

    # --- write into page.meta (used by template) ----------------------
    page.meta.setdefault("description", description)
    page.meta.setdefault("author", "GenisisIQ")
    page.meta.setdefault("date", date_str)
    if first_image:
        page.meta.setdefault("image", first_image)

    return markdown


# ── helpers ──────────────────────────────────────────────────

def _extract_section1_topics(markdown: str) -> list[str]:
    """Return subsection titles from '## 1. …' up to '## 2. …'."""
    section1 = re.search(
        r"^## 1\.\s.+?\n(.*?)(?=^## 2\.|\Z)",
        markdown,
        re.MULTILINE | re.DOTALL,
    )
    if not section1:
        return []
    # Match  ### 1.X Title (🡕)  or  ### 1.X Title（🡕）
    return re.findall(
        r"^###\s+\d+\.\d+\s+(.+?)\s*(?:[（(].+?[）)])\s*$",
        section1.group(1),
        re.MULTILINE,
    )


def _extract_first_image(markdown: str) -> str | None:
    """Return the URL of the first markdown image, or None."""
    m = re.search(r"!\[.*?\]\((.+?)\)", markdown)
    return m.group(1) if m else None

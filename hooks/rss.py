"""MkDocs hook: generate RSS feeds for daily report pages."""
from __future__ import annotations

import re
from datetime import UTC, datetime, time
from email.utils import format_datetime
from pathlib import Path
from xml.etree import ElementTree as ET


_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?:\.zh)?\.md$")
_HEADING_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
_SECTION_RE = re.compile(
    r"^##\s+1\.\s+.+?\n(.*?)(?=^##\s+2\.|\Z)",
    re.MULTILINE | re.DOTALL,
)
_MARKDOWN_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_reports: list[dict[str, str]] = []


def on_config(config):
    """Reset module state for repeated builds, e.g. during mkdocs serve."""
    _reports.clear()
    return config


def on_page_markdown(markdown, page, config, files):
    """Collect report metadata after title.py has populated page.meta."""
    if not _DATE_RE.fullmatch(page.file.src_path.rsplit("/", 1)[-1]):
        return markdown

    language = str(config.get("theme", {}).get("language", "en"))
    date_str = page.meta.get("date") or page.file.name.removesuffix(
        ".zh.md"
    ).removesuffix(".md")
    title = page.meta.get("title") or _extract_title(markdown) or page.title or date_str
    description = page.meta.get("description") or _extract_summary(markdown)

    _reports.append(
        {
            "lang": language,
            "date": date_str,
            "title": str(title),
            "description": description,
            "dest_uri": page.file.dest_uri,
        }
    )

    return markdown


def on_post_build(config, **kwargs):
    """Write the RSS feed for the active language build."""
    site_dir = Path(config["site_dir"])
    site_url = str(config.get("site_url", "")).rstrip("/") + "/"
    language = str(config.get("theme", {}).get("language", "en"))

    if language == "zh":
        _write_feed(
            site_dir / "zh" / "feed.xml",
            reports=[r for r in _reports if r["lang"] == language],
            site_url=site_url,
            feed_path="zh/feed.xml",
            title=config.get("site_name", "AI趋势速递"),
            description=config.get("site_description", ""),
            language="zh-CN",
            homepage_path="zh/",
        )
    else:
        _write_feed(
            site_dir / "feed.xml",
            reports=[r for r in _reports if r["lang"] == language],
            site_url=site_url,
            feed_path="feed.xml",
            title=config.get("site_name", "AI Pulse Daily"),
            description=config.get("site_description", ""),
            language="en",
            homepage_path="",
        )

    _reports.clear()


def _write_feed(
    path: Path,
    reports: list[dict[str, str]],
    site_url: str,
    feed_path: str,
    title: str,
    description: str,
    language: str,
    homepage_path: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    reports = sorted(
        reports, key=lambda r: (r["date"], r["dest_uri"]), reverse=True
    )[:20]

    rss = ET.Element(
        "rss", {"version": "2.0", "xmlns:atom": "http://www.w3.org/2005/Atom"}
    )
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = title
    ET.SubElement(channel, "link").text = _absolute_url(site_url, homepage_path)
    ET.SubElement(channel, "description").text = description
    ET.SubElement(channel, "language").text = language
    ET.SubElement(channel, "lastBuildDate").text = format_datetime(
        datetime.now(UTC), usegmt=True
    )
    ET.SubElement(
        channel,
        "atom:link",
        {
            "href": _absolute_url(site_url, feed_path),
            "rel": "self",
            "type": "application/rss+xml",
        },
    )

    for report in reports:
        link = _absolute_url(site_url, report["dest_uri"])
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = report["title"]
        ET.SubElement(item, "link").text = link
        ET.SubElement(item, "guid", {"isPermaLink": "true"}).text = link
        ET.SubElement(item, "description").text = report["description"]
        ET.SubElement(item, "pubDate").text = _rss_date(report["date"])

    tree = ET.ElementTree(rss)
    ET.indent(tree, space="  ")
    tree.write(path, encoding="utf-8", xml_declaration=True)


def _absolute_url(site_url: str, path: str) -> str:
    return site_url + path.lstrip("/")


def _rss_date(date_str: str) -> str:
    dt = datetime.combine(datetime.strptime(date_str, "%Y-%m-%d").date(), time.min, UTC)
    return format_datetime(dt, usegmt=True)


def _extract_title(markdown: str) -> str | None:
    match = _HEADING_RE.search(markdown)
    return _clean_text(match.group(1)) if match else None


def _extract_summary(markdown: str) -> str:
    match = _SECTION_RE.search(markdown)
    source = match.group(1) if match else markdown
    paragraphs = [
        line.strip()
        for line in source.splitlines()
        if line.strip() and not line.startswith(("#", "|", "---"))
    ]
    return _clean_text(" ".join(paragraphs))[:500]


def _clean_text(value: str) -> str:
    value = _MARKDOWN_LINK_RE.sub(r"\1", value)
    value = _HTML_TAG_RE.sub("", value)
    return _WS_RE.sub(" ", value).strip()

#!/usr/bin/env python3
"""Build the subscriber-email HTML body for newly published reports.

Reads newline-separated report markdown paths from stdin (or argv) and prints
the rendered HTML body to stdout. Reuses ``_extract_section1_topics`` from
``hooks/title.py`` so descriptions stay aligned with the website's RSS feed
and page metadata.

Exit codes:
    0  success
    1  one or more report files were not found
    2  no report paths supplied
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "hooks"))
from title import _extract_section1_topics  # type: ignore  # noqa: E402

SITE_URL = "https://genisisiq.com"
DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
# Gmail clips emails near 102 KB; leave generous headroom for envelope/headers.
MAX_BODY_BYTES = 80 * 1024


def _read_paths(argv: list[str]) -> list[str]:
    raw = "\n".join(argv[1:]) if len(argv) > 1 else sys.stdin.read()
    return [line.strip() for line in raw.splitlines() if line.strip()]


def _parse_report_path(path: str) -> tuple[str, str, str]:
    parts = path.split("/")
    if len(parts) < 4 or parts[0] != "docs":
        raise ValueError(f"Unsupported report path layout: {path!r}")
    source, topic, filename = parts[1], parts[2], parts[3]
    match = DATE_RE.match(filename)
    if not match:
        raise ValueError(f"Filename does not match YYYY-MM-DD.md: {path!r}")
    return source, topic, match.group(1)


def _title_for(source: str, topic: str, date: str, markdown: str) -> str:
    match = H1_RE.search(markdown)
    if match:
        return match.group(1).strip()
    return f"{source.title()} {topic.replace('-', ' ').title()} — {date}"


def _description_for(source: str, topic: str, date: str, markdown: str) -> str:
    source_label = source.title()
    topic_label = topic.replace("-", " ").title()
    topics = _extract_section1_topics(markdown)
    if topics:
        return f"{source_label} {topic_label} — {date}: " + " · ".join(topics)
    return f"{source_label} {topic_label} report for {date}."


def _report_url(source: str, topic: str, date: str) -> str:
    return f"{SITE_URL}/{source}/{topic}/{date}/"


def _build_entries(paths: Iterable[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for path in paths:
        source, topic, date = _parse_report_path(path)
        text = Path(path).read_text(encoding="utf-8")
        entries.append(
            {
                "source": source,
                "topic": topic,
                "date": date,
                "title": _title_for(source, topic, date, text),
                "description": _description_for(source, topic, date, text),
                "url": _report_url(source, topic, date),
            }
        )
    return entries


def _render_card(
    *,
    title: str,
    source: str,
    topic: str,
    date: str,
    url: str,
    description: str,
) -> str:
    source_label = html.escape(source.title())
    topic_label = html.escape(topic.replace("-", " ").title())
    safe_title = html.escape(title)
    safe_date = html.escape(date)
    safe_url = html.escape(url, quote=True)
    safe_desc = html.escape(description)
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'width="100%" style="margin:0 0 16px 0;border-collapse:collapse;">'
        "<tr>"
        '<td style="padding:18px 20px;background:#ffffff;border:1px solid #e6e8eb;'
        "border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,"
        "'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">"
        f'<a href="{safe_url}" style="color:#0b5fff;text-decoration:none;'
        f'font-size:18px;font-weight:600;line-height:1.35;">{safe_title}</a>'
        f'<div style="margin-top:6px;color:#6b7280;font-size:13px;">'
        f"{source_label} &middot; {topic_label} &middot; {safe_date}</div>"
        f'<p style="margin:12px 0 14px 0;color:#1f2937;font-size:14px;'
        f'line-height:1.55;">{safe_desc}</p>'
        f'<a href="{safe_url}" style="color:#0b5fff;text-decoration:none;'
        f'font-size:14px;font-weight:500;">Read full report &rarr;</a>'
        "</td></tr></table>"
    )


def _render_overflow(count: int) -> str:
    return (
        '<p style="margin:0 0 24px 0;color:#6b7280;font-size:13px;'
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
        'Helvetica,Arial,sans-serif;">'
        f"&hellip; and {count} more &mdash; "
        f'<a href="{SITE_URL}/" style="color:#0b5fff;text-decoration:none;">'
        "see all reports on the site</a>.</p>"
    )


def _render_body(cards_html: str) -> str:
    # `{{UNSUBSCRIBE_URL}}` is substituted by the newsletter worker per recipient.
    return (
        "<!DOCTYPE html><html><body "
        'style="margin:0;padding:0;background:#f5f7fa;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'width="100%" style="background:#f5f7fa;">'
        '<tr><td align="center" style="padding:24px 12px;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'width="100%" style="max-width:600px;">'
        "<tr><td style=\"padding-bottom:16px;font-family:-apple-system,"
        "BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">"
        '<h1 style="margin:0 0 4px 0;color:#111827;font-size:22px;'
        'font-weight:700;">New AI Pulse Daily reports</h1>'
        '<div style="color:#6b7280;font-size:14px;">'
        "A quick digest of reports just published.</div>"
        "</td></tr>"
        f"<tr><td>{cards_html}</td></tr>"
        '<tr><td style="padding:8px 0 24px 0;font-family:-apple-system,'
        "BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
        'color:#6b7280;font-size:13px;">'
        f'Visit <a href="{SITE_URL}/" style="color:#0b5fff;'
        'text-decoration:none;">AI Pulse Daily</a> for the full archive.'
        "</td></tr>"
        '<tr><td style="padding:16px 0 0 0;border-top:1px solid #e6e8eb;'
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
        'Helvetica,Arial,sans-serif;color:#9ca3af;font-size:12px;">'
        "You&rsquo;re receiving this because you subscribed at "
        f'<a href="{SITE_URL}/" style="color:#9ca3af;">genisisiq.com</a>. '
        '<a href="{{UNSUBSCRIBE_URL}}" style="color:#9ca3af;">Unsubscribe</a>.'
        "</td></tr></table></td></tr></table></body></html>"
    )


def _assemble(entries: list[dict[str, str]]) -> str:
    # Stable two-pass sort: date desc, then source asc, then topic asc.
    entries.sort(key=lambda e: (e["source"], e["topic"]))
    entries.sort(key=lambda e: e["date"], reverse=True)

    base_overhead = len(_render_body("").encode("utf-8"))
    budget = MAX_BODY_BYTES - base_overhead

    included: list[str] = []
    used = 0
    for index, entry in enumerate(entries):
        card = _render_card(**entry)
        card_bytes = len(card.encode("utf-8"))
        remaining_after = len(entries) - index - 1
        reserve = len(_render_overflow(remaining_after).encode("utf-8")) if remaining_after else 0
        if used + card_bytes + reserve > budget and included:
            skipped = len(entries) - index
            included.append(_render_overflow(skipped))
            break
        included.append(card)
        used += card_bytes

    return _render_body("".join(included))


def main(argv: list[str]) -> int:
    paths = _read_paths(argv)
    if not paths:
        print("No report paths provided.", file=sys.stderr)
        return 2

    missing = [p for p in paths if not Path(p).is_file()]
    if missing:
        print("Report files not found:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 1

    sys.stdout.write(_assemble(_build_entries(paths)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

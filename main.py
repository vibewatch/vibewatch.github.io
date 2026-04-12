"""Custom macros for mkdocs-macros-plugin."""

import calendar
from datetime import datetime
from pathlib import Path

# Directories to skip when auto-discovering sources
_SKIP_DIRS = {"stylesheets", "assets", "images"}


def define_env(env):
    docs_dir = Path(env.conf["docs_dir"])

    @env.macro
    def list_reports(source: str, topic: str, limit: int = 0) -> list[dict]:
        """Return report metadata sorted by date descending.

        Each dict has keys: date, label, path.
        """
        folder = docs_dir / source / topic
        if not folder.is_dir():
            return []

        reports = []
        for f in sorted(folder.glob("*.md"), reverse=True):
            try:
                dt = datetime.strptime(f.stem, "%Y-%m-%d")
            except ValueError:
                continue
            reports.append(
                {
                    "date": f.stem,
                    "label": dt.strftime("%b %-d"),
                    "path": f"{source}/{topic}/{f.name}",
                }
            )

        if limit:
            reports = reports[:limit]
        return reports

    @env.macro
    def list_all_topics(limit: int = 7) -> list[dict]:
        """Auto-discover all source/topic combinations from the docs tree.

        Returns a list of dicts with: source, source_label, source_icon,
        topic, topic_label, description, reports.
        """
        extra = env.conf.get("extra", {})
        sources_meta = extra.get("sources", {})
        topics_meta = extra.get("topics", {})

        results = []
        for source_dir in sorted(docs_dir.iterdir()):
            if not source_dir.is_dir() or source_dir.name.startswith((".", "_")):
                continue
            source_name = source_dir.name
            if source_name in _SKIP_DIRS or source_name not in sources_meta:
                continue

            for topic_dir in sorted(source_dir.iterdir()):
                if not topic_dir.is_dir() or topic_dir.name.startswith((".", "_")):
                    continue
                topic_name = topic_dir.name
                reports = list_reports(source_name, topic_name, limit)
                if not reports:
                    continue
                smeta = sources_meta.get(source_name, {})
                tmeta = topics_meta.get(topic_name, {})
                results.append(
                    {
                        "source": source_name,
                        "source_label": smeta.get("label", source_name.title()),
                        "source_icon": smeta.get("icon", ""),
                        "topic": topic_name,
                        "topic_label": tmeta.get(
                            "label", topic_name.replace("-", " ").title()
                        ),
                        "description": tmeta.get("description", ""),
                        "reports": reports,
                    }
                )
        return results

    @env.macro
    def report_calendar(source: str, topic: str) -> str:
        """Render monthly calendar grids with clickable report dates."""
        reports = list_reports(source, topic)
        if not reports:
            return ""

        # Build a set of dates and a map to paths
        date_map: dict[str, str] = {}
        for r in reports:
            date_map[r["date"]] = f"{r['date']}/"

        # Group by (year, month)
        months: dict[tuple[int, int], None] = {}
        for d in date_map:
            dt = datetime.strptime(d, "%Y-%m-%d")
            months[(dt.year, dt.month)] = None

        # Sort months descending (newest first)
        sorted_months = sorted(months.keys(), reverse=True)

        html_parts = ['<div class="report-calendar-wrap">']
        for year, month in sorted_months:
            month_name = calendar.month_name[month]
            cal = calendar.Calendar(firstweekday=6)  # Sunday first
            weeks = cal.monthdayscalendar(year, month)

            html_parts.append(f'<div class="report-calendar">')
            html_parts.append(
                f'<div class="report-calendar__title">{month_name} {year}</div>'
            )
            html_parts.append('<table class="report-calendar__grid">')
            html_parts.append("<thead><tr>")
            for day_name in ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]:
                html_parts.append(f"<th>{day_name}</th>")
            html_parts.append("</tr></thead>")
            html_parts.append("<tbody>")

            for week in weeks:
                html_parts.append("<tr>")
                for day in week:
                    if day == 0:
                        html_parts.append('<td class="report-calendar__empty"></td>')
                    else:
                        date_str = f"{year}-{month:02d}-{day:02d}"
                        if date_str in date_map:
                            html_parts.append(
                                f'<td class="report-calendar__day report-calendar__day--has-report">'
                                f'<a href="{date_map[date_str]}">{day}</a></td>'
                            )
                        else:
                            html_parts.append(
                                f'<td class="report-calendar__day">{day}</td>'
                            )
                html_parts.append("</tr>")

            html_parts.append("</tbody></table></div>")

        html_parts.append("</div>")
        return "\n".join(html_parts)

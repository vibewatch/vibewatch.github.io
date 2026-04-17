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

        # Detect language from the current page
        is_zh = False
        if hasattr(env, "page") and env.page and hasattr(env.page, "file"):
            is_zh = env.page.file.src_path.endswith(".zh.md")

        month_names_zh = {
            1: "1月", 2: "2月", 3: "3月", 4: "4月",
            5: "5月", 6: "6月", 7: "7月", 8: "8月",
            9: "9月", 10: "10月", 11: "11月", 12: "12月",
        }

        reports = []
        for f in sorted(folder.glob("*.md"), reverse=True):
            try:
                dt = datetime.strptime(f.stem, "%Y-%m-%d")
            except ValueError:
                continue
            if is_zh:
                label = f"{month_names_zh[dt.month]}{dt.day}日"
            else:
                label = dt.strftime("%b %-d")
            reports.append(
                {
                    "date": f.stem,
                    "label": label,
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

        # Detect language from the current page source file
        is_zh = False
        if hasattr(env, "page") and env.page and hasattr(env.page, "file"):
            is_zh = env.page.file.src_path.endswith(".zh.md")

        results = []
        for source_name in sources_meta:
            source_dir = docs_dir / source_name
            if not source_dir.is_dir():
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
                desc_key = "description_zh" if is_zh else "description"
                results.append(
                    {
                        "source": source_name,
                        "source_label": smeta.get("label", source_name.title()),
                        "source_icon": smeta.get("icon", ""),
                        "topic": topic_name,
                        "topic_label": tmeta.get(
                            "label", topic_name.replace("-", " ").title()
                        ),
                        "description": tmeta.get(desc_key, tmeta.get("description", "")),
                        "reports": reports,
                    }
                )
        return results

    @env.macro
    def list_topics_grouped_by_source(limit: int = 7) -> list[dict]:
        """Return topics grouped by source.

        Each dict has: source, source_label, source_icon, topics (list).
        Each topic dict has: topic, topic_label, description, reports.
        """
        all_topics = list_all_topics(limit)
        from collections import OrderedDict

        groups: OrderedDict[str, dict] = OrderedDict()
        for t in all_topics:
            key = t["source"]
            if key not in groups:
                groups[key] = {
                    "source": t["source"],
                    "source_label": t["source_label"],
                    "source_icon": t["source_icon"],
                    "topics": [],
                }
            groups[key]["topics"].append(
                {
                    "topic": t["topic"],
                    "topic_label": t["topic_label"],
                    "description": t["description"],
                    "reports": t["reports"],
                    "source": t["source"],
                }
            )
        return list(groups.values())

    @env.macro
    def report_calendar(source: str, topic: str) -> str:
        """Render monthly calendar grids with clickable report dates."""
        reports = list_reports(source, topic)
        if not reports:
            return ""

        # Detect language from current page
        is_zh = False
        if hasattr(env, "page") and env.page and hasattr(env.page, "file"):
            is_zh = env.page.file.src_path.endswith(".zh.md")

        month_names_zh = {
            1: "一月", 2: "二月", 3: "三月", 4: "四月",
            5: "五月", 6: "六月", 7: "七月", 8: "八月",
            9: "九月", 10: "十月", 11: "十一月", 12: "十二月",
        }
        day_names = (
            ["日", "一", "二", "三", "四", "五", "六"]
            if is_zh
            else ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        )

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

        # Count total reports for summary
        total_reports = len(date_map)

        html_parts = ['<div class="report-calendar-wrap">']
        for year, month in sorted_months:
            if is_zh:
                month_label = f"{year}年 {month_names_zh[month]}"
            else:
                month_label = f"{calendar.month_name[month]} {year}"

            # Count reports in this month
            month_report_count = sum(
                1 for d in date_map
                if d.startswith(f"{year}-{month:02d}-")
            )

            cal = calendar.Calendar(firstweekday=6)  # Sunday first
            weeks = cal.monthdayscalendar(year, month)

            html_parts.append(f'<div class="report-calendar">')
            html_parts.append(
                f'<div class="report-calendar__header">'
                f'<div class="report-calendar__title">{month_label}</div>'
                f'<div class="report-calendar__count">{month_report_count}</div>'
                f'</div>'
            )
            html_parts.append('<table class="report-calendar__grid">')
            html_parts.append("<thead><tr>")
            for i, day_name in enumerate(day_names):
                weekend_cls = ' class="report-calendar__weekend"' if i == 0 or i == 6 else ""
                html_parts.append(f"<th{weekend_cls}>{day_name}</th>")
            html_parts.append("</tr></thead>")
            html_parts.append("<tbody>")

            for week in weeks:
                html_parts.append("<tr>")
                for col, day in enumerate(week):
                    if day == 0:
                        html_parts.append('<td class="report-calendar__empty"></td>')
                    else:
                        date_str = f"{year}-{month:02d}-{day:02d}"
                        classes = ["report-calendar__day"]
                        if col == 0 or col == 6:
                            classes.append("report-calendar__day--weekend")
                        if date_str in date_map:
                            classes.append("report-calendar__day--has-report")
                            html_parts.append(
                                f'<td class="{" ".join(classes)}">'
                                f'<a href="{date_map[date_str]}">{day}</a></td>'
                            )
                        else:
                            html_parts.append(
                                f'<td class="{" ".join(classes)}">{day}</td>'
                            )
                html_parts.append("</tr>")

            html_parts.append("</tbody></table></div>")

        html_parts.append("</div>")
        return "\n".join(html_parts)

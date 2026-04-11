"""Custom macros for mkdocs-macros-plugin."""

from datetime import datetime
from pathlib import Path


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

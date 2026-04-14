"""MkDocs hook: hide individual date pages from sidebar navigation.

Keeps only the index page under each topic section, so the sidebar stays
compact. Date pages are still built and accessible via links/calendar.
"""

import re


def on_nav(nav, config, files):
    _prune_nav(nav.items)
    return nav


def _prune_nav(items):
    for section in items:
        if hasattr(section, "children") and section.children:
            section.children = [
                child for child in section.children
                if not _is_date_page(child)
            ]
            _prune_nav(section.children)


def _is_date_page(item):
    if hasattr(item, "file") and item.file:
        stem = item.file.name.removesuffix(".md")
        stem = re.sub(r"\.zh$", "", stem)
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", stem))
    return False

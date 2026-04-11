"""MkDocs hook: set nav title to yyyy-MM-dd for date-named pages."""

import re


def on_page_read_source(page, config):
    stem = page.file.name.removesuffix(".md")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", stem):
        page.title = stem

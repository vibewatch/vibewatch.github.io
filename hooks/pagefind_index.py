"""MkDocs post-build hook: run Pagefind over the built site.

Set SKIP_PAGEFIND=1 to skip indexing (useful during `mkdocs serve` for faster
iteration).
"""
from __future__ import annotations

import os
import subprocess
import sys


def on_post_build(config, **kwargs):
    if os.environ.get("SKIP_PAGEFIND") == "1":
        print("[pagefind] SKIP_PAGEFIND=1 — skipping index build")
        return

    site_dir = config["site_dir"]
    print(f"[pagefind] Indexing {site_dir} ...")
    try:
        subprocess.run(
            [sys.executable, "-m", "pagefind", "--site", site_dir],
            check=True,
        )
    except FileNotFoundError:
        print("[pagefind] pagefind not installed; run `uv add pagefind[extended]`")
        raise
    except subprocess.CalledProcessError as e:
        print(f"[pagefind] failed with exit code {e.returncode}")
        raise

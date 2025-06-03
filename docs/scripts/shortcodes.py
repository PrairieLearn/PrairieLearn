# Copyright (c) 2016-2025 Martin Donath <martin.donath@squidfunk.com>

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to
# deal in the Software without restriction, including without limitation the
# rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
# sell copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
# IN THE SOFTWARE.

# Modified from squidfunk/mkdocs-material/src/overrides/hooks/shortcodes.py
# If GITHUB_TOKEN is unset, no transformations are done.

from __future__ import annotations

import os
import pickle
import re
from pathlib import Path
from re import Match
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mkdocs.config.defaults import MkDocsConfig
    from mkdocs.structure.files import Files
    from mkdocs.structure.pages import Page

from github import Auth, Github

CACHE_PATH = Path(".cache") / "shortcodes" / "data.pkl"
TOKEN = os.getenv("GITHUB_TOKEN")

pl_repo = None
did_init = False
cache = {}


def _init() -> None:
    global cache, pl_repo, did_init  # noqa: PLW0603
    did_init = True
    if TOKEN:
        auth = Auth.Token(TOKEN)
        g = Github(auth=auth)
        pl_repo = g.get_repo("prairielearn/prairielearn")
        cache = _get_cache()


def on_page_markdown(
    markdown: str,
    *,
    page: Page,
    config: MkDocsConfig,  # noqa: ARG001
    files: Files,
) -> str:
    """
    Resolve comments to markdown badges.

    For example, allows you to write `<!-- md:pr 10000 -->`
    and resolve this to a badge of when the associated PR was merged.
    """
    if not did_init:
        _init()

    def replace(match: Match[str]) -> str:
        kind, args = match.groups()
        args = args.strip()
        if kind == "pr":
            return _badge_for_pr(args, page, files, with_date=False)
        if kind == "pr-date":
            return _badge_for_pr(args, page, files, with_date=True)
        # Otherwise, raise an error
        raise RuntimeError(f"Unknown shortcode: {kind}")

    # If no github authentication token, skip this process
    if not pl_repo:
        print(pl_repo)
        return markdown

    # Find and replace all external asset URLs in current page
    return re.sub(
        r"<!-- md:([\w-]+)(.*?) -->",
        replace,
        markdown,
        flags=re.IGNORECASE | re.MULTILINE,
    )


# Create badge
def _badge(icon: str, text: str = "", kind: str = "") -> str:
    classes = f"mdx-badge mdx-badge--{kind}" if kind else "mdx-badge"
    return "".join([
        f'<span class="{classes}">',
        *([f'<span class="mdx-badge__icon">{icon}</span>'] if icon else []),
        *([f'<span class="mdx-badge__text">{text}</span>'] if text else []),
        "</span>",
    ])


def _badge_for_pr(
    text: str,
    page: Page,  # noqa: ARG001
    files: Files,  # noqa: ARG001
    *,
    with_date: bool = False,
) -> str:
    global cache  # noqa: PLW0602
    try:
        pr_num = int(text)
    except ValueError:
        raise RuntimeError(f"Invalid PR number: {text}")

    meta = cache.get(pr_num)
    if not pl_repo:
        raise RuntimeError("API not found")
    if meta is None:
        meta = pl_repo.get_pull(pr_num)
        cache[pr_num] = meta
        _save_cache(cache)

    icon = "material-progress-clock"
    badge_text = meta.created_at.strftime("%B %-d, %Y")
    if meta.merged_at:
        icon = "material-progress-check"
        badge_text = meta.merged_at.strftime("%B %-d, %Y")
    return _badge(
        icon=f"[:{icon}:]({meta.html_url})",
        text=f"{badge_text}" if with_date else "",
    )


def _get_cache() -> dict:  # type: ignore
    try:
        with open(CACHE_PATH, "rb") as f:
            return pickle.load(f)
    except FileNotFoundError:
        return {}


def _save_cache(new_cache: dict) -> None:  # type: ignore
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "wb") as f:
        pickle.dump(new_cache, f)

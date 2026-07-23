#!/usr/bin/env python3
import json
import os
import re
import string
import sys
import urllib.request
from itertools import chain
from typing import Any

# Regex to find GitHub Actions usages: 'uses: owner/repo@tag'
# It captures 'owner/repo' in group 1, 'tag' in group 2
ACTION_REGEX = re.compile(
    r"uses:\s*([a-zA-Z0-9-_\.]+/[a-zA-Z0-9-_\.]+)(?:/.*)?@([a-zA-Z0-9-_\.]+)"
)


def make_request(url: str) -> Any:
    """Helper to perform GitHub API GET requests."""
    headers = {
        "User-Agent": "Python-GH-Action-Hasher",
        "Accept": "application/vnd.github+json",
    }
    if os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = f"token {os.getenv('GITHUB_TOKEN')}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"API Error on {url}: {e}", file=sys.stderr)
        return None


# Cache hashes to avoid duplicate API calls for the same action/tag
hash_cache: dict[str, str] = {}
tag_cache: dict[str, str] = {}


def get_action_hash(action_name: str, tag: str) -> str | None:
    """Fetches the commit SHA for a specific tag from the GitHub API."""
    url = f"https://api.github.com/repos/{action_name}/git/refs/tags/{tag}"
    data = make_request(url)
    if not data:
        return None

    # If data is an array, there are multiple refs. We'll take the last one.
    if isinstance(data, list):
        data = data[-1]
    obj_type = data["object"]["type"]

    # If it's an annotated tag, we need to fetch the target commit SHA
    if obj_type == "tag":
        tag_url = data["object"]["url"]
        tag_data = make_request(tag_url)
        if tag_data:
            return tag_data["object"]["sha"]

    return data["object"]["sha"]


def get_tag_from_hash(action_name: str, commit_sha: str) -> str | None:
    """Finds the version tag associated with a specific commit hash by checking the repo tags list."""
    url = f"https://api.github.com/repos/{action_name}/tags?per_page=100"
    tags_data = make_request(url)

    if not tags_data or not isinstance(tags_data, list):
        return None

    for tag_obj in tags_data:
        if tag_obj.get("commit", {}).get("sha") == commit_sha:
            return tag_obj.get("name")

    return None


def process_workflow_file(file_path: str, *, check_only: bool) -> None:
    """Reads a file, replaces tags with hashes, and writes back the changes."""
    with open(file_path, encoding="utf-8") as f:
        content = f.read()

    matches = ACTION_REGEX.findall(content)
    if not matches:
        return

    modified = False

    for action_name, tag in matches:
        if len(tag) == 40 and all(c in string.hexdigits for c in tag):
            sha = tag  # Already a SHA, no need to fetch
        elif check_only:
            print(f"Action {action_name}@{tag} is not pinned to a commit SHA.")
            sys.exit(1)
        else:
            cache_key = f"{action_name}@{tag}"
            if cache_key not in hash_cache:
                print(f"Fetching hash for {cache_key}...")
                sha = get_action_hash(action_name, tag)
                if sha:
                    hash_cache[cache_key] = sha
                else:
                    continue

            sha = hash_cache[cache_key]

        # Retrieve the tag associated with the SHA to include in the comment
        tag_cache_key = f"{action_name}@{sha}"
        if tag_cache_key not in tag_cache:
            resolved_tag = get_tag_from_hash(action_name, sha)
            if resolved_tag:
                tag_cache[tag_cache_key] = resolved_tag
        # Purposely override original tag with "tag not found" if it wasn't resolved, to avoid misleading comments
        resolved_tag = tag_cache.get(tag_cache_key) or "tag not found"

        # Replace the tag with the SHA and add a comment indicating the original tag
        # Example: actions/checkout@v4 -> actions/checkout@b4ffde... # v4
        old_pattern = f"{action_name}@{tag}"
        new_pattern = f"{action_name}@{sha} # {resolved_tag}"

        if old_pattern in content:
            pattern = rf"uses:\s*{re.escape(old_pattern)}[ \t]*(#.*)?"
            if check_only:
                for match in re.finditer(pattern, content):
                    if match.group(0) != f"uses: {new_pattern}":
                        print(
                            f"Check failed: {file_path} uses invalid tag format.\nExpected: uses: {new_pattern}\nFound:    {match.group(0)}\nRun `make format-actions-version` to update the file."
                        )
                        sys.exit(1)
            else:
                content = re.sub(pattern, f"uses: {new_pattern}", content)
                modified = True

    if modified:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated: {file_path}")


def main() -> None:  # noqa: D103

    # Read arguments, if --check is provided, we only check for changes without writing
    check_only = "--check" in sys.argv

    # Target the standard GitHub workflows directory
    workflow_dirs = (".github/workflows", ".github/actions")

    for workflow_dir in workflow_dirs:
        if not os.path.isdir(workflow_dir):
            print(
                f"Directory {workflow_dir} not found. Please run this from your repository root."
            )
            sys.exit(1)

    for root, _, files in chain.from_iterable(
        os.walk(workflow_dir) for workflow_dir in workflow_dirs
    ):
        for file in files:
            if file.endswith((".yml", ".yaml")):
                file_path = os.path.join(root, file)
                print(f"Processing {file_path}...")
                process_workflow_file(file_path, check_only=check_only)


if __name__ == "__main__":
    main()

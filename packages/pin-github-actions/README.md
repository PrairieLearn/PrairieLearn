# @prairielearn/pin-github-actions

CLI tool to pin GitHub Actions references to commit SHAs and maintain tag comments.

GitHub Actions references can be pinned to a specific commit SHA by using the `@<commit-sha>` syntax. For example, the following reference is pinned to a specific commit:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
```

This script ensures that all GitHub Actions references in `.github/workflows` and `.github/actions` are pinned to a specific commit SHA, and that the corresponding tag is included in a comment above the reference.

By default, the script will find all GitHub Actions references in `.github/workflows` and `.github/actions`, pin them to the latest commit SHA, and add a comment with the corresponding tag above the reference.

The script can also be run in "check" mode to verify that all references are pinned and have the correct comments. This is useful for CI/CD pipelines to ensure that all references are properly pinned. The script checks that the commit SHA matches the tag in the comment and in the GitHub API for the action. If any references are not pinned or have incorrect comments, the script will exit with a non-zero status code.

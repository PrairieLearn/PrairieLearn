# @prairielearn/pin-github-actions

CLI tool to pin GitHub Actions references to commit SHAs and maintain tag comments.

GitHub Actions references can be pinned to a specific commit SHA by using the `@<commit-sha>` syntax. For example, the following reference is pinned to a specific commit:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
```

This script ensures that all GitHub Actions references in `.github/workflows` and `.github/actions` are pinned to a specific commit SHA, and that the corresponding tag is included in an inline comment.

By default, the script finds all GitHub Actions references in `.github/workflows` and `.github/actions`, resolves tag references to commit SHAs, and adds or updates inline comments with the corresponding tags.

The script can also be run in "check" mode to verify that all references are pinned and have the correct comments. This is useful for CI/CD pipelines to ensure that all references are properly pinned. The script checks that the commit SHA matches the tag in the comment and in the GitHub API for the action. If any references are not pinned or have incorrect comments, the script will exit with a non-zero status code.

## Usage

Install the package as a development dependency:

```sh
npm install --save-dev @prairielearn/pin-github-actions
```

Run the CLI from the root of your repository to pin references and update their tag comments:

```sh
npx pin-github-actions
```

To check the files without modifying them:

```sh
npx pin-github-actions --check
```

The CLI must be run from a repository root containing `.github/workflows`; `.github/actions` is scanned when present. Set `GITHUB_TOKEN` when possible to authenticate requests and avoid GitHub API rate limits.

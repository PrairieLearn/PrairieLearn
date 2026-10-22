# scripts

This directory contains various scripts that are used internally to develop PrairieLearn. They are not intended for use by end users of PrairieLearn. See [the `contrib` directory](../contrib) for useful tools for course content development and operation that have been contributed by the PrairieLearn community.

## Python dependency updates

Dependabot is configured in [`.github/dependabot.yml`](../.github/dependabot.yml). Scheduled Python version updates use a monthly group spanning `pip` and `uv`. Security updates use separate groups for each ecosystem: the `pip` group combines available security fixes across the configured application, grader, and workspace directories, while the `uv` group handles the root lockfile. Security groups can include multiple packages, and GitHub [does not combine security updates across ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-errors#failed-to-group-dependencies-security-updates).

Run `make check-python-dependencies` to check shared Python dependency pins. The Python CI job runs the same check for all PRs. It reads `pyproject.toml` and `requirements*.txt` files in the repository root, `apps/*/python`, `docs`, `graders/*`, `images/*`, and `workspaces/*`, so new images in these directories are included automatically. It compares unconditional exact pins (`==`) in requirements files and in project dependencies, optional dependencies, and dependency groups. Package names are normalized so that, for example, `Pillow` and `pillow` refer to the same package.

If the check fails, update the conflicting pins together in the same PR, including those in other images. Run `uv lock` when changing the root `pyproject.toml`, then rerun the check. For the Python helper package, `make update-python-helper-dependencies` can sync its dependencies from the root project.

The check only reads manifests and uses Python's standard library; it does not install dependencies, contact registries, or build images. It excludes version ranges, wildcard pins, and requirements with environment markers, which can intentionally differ between environments. It does not compare transitive dependencies or `uv.lock`; the existing locked dependency installation in CI verifies that the lockfile is current.

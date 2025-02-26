# Contributing to PrairieLearn

PrairieLearn is an open-source project and welcomes contributions from anyone. See the [contributing guidelines](https://github.com/PrairieLearn/PrairieLearn/blob/master/CONTRIBUTING.md) to learn more about the contribution process.

## Maintainer guidelines

A trusted group of core developers are responsible for maintaining the PrairieLearn repository. This responsibility includes upholding code quality, ensuring smooth collaboration, and fostering an open-source community. These guidelines outline the expectations and conventions for maintainers.

### General principles

- **Use maintainer privileges wisely**

  - Do not approve or merge changes you do not fully understand.
  - If you’d like to understand a PR better, ask questions rather than making assumptions.

- **Merging responsibilities**

  - If a maintainer opens a PR, that person is responsible for merging it after it has been approved.
  - For PRs from non-maintainers, the primary reviewer is responsible for merging the PR. If there are outstanding nitpicks or unresolved discussions, consult with the author before merging.

- **Taking over abandoned PRs**
  - If a PR appears abandoned, another maintainer may choose to take it over.
  - The new maintainer assumes responsibility for responding to feedback and ultimately merging.
  - Use discretion when deciding to take over a PR; consider reaching out to the original author first.

### Code review guidelines

- **Review comments**

  - It is acceptable to approve a PR and still leave comments. The expectation is that these comments will be addressed by the PR author before the PR is merged.
  - Small, subjective suggestions ("nits") are acceptable in reviews. Clearly label nits (e.g., "Nit: consider renaming this for clarity.") to distinguish them from required changes.

- **Addressing code review comments**
  - All code review comments should be addressed before merging.
  - Addressing a comment does not always mean making a change. It may involve:
    - Explaining why a change is unnecessary. Ideally, wait for the reviewer to acknowledge this before considering the comment to be addressed.
    - Deferring a fix to a fast-follow PR and explicitly stating that in a comment.
    - For non-critical issues, opening an issue to track the need for a change in the future.
  - Use your best judgment to determine whether a comment has been sufficiently addressed.

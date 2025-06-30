# Contributing to PrairieLearn

PrairieLearn is an open-source project and welcomes contributions from anyone. See the [contributing guidelines](https://github.com/PrairieLearn/PrairieLearn/blob/master/CONTRIBUTING.md) to learn more about the contribution process.

## Maintainer guidelines

A trusted group of core developers are responsible for maintaining the PrairieLearn repository. This responsibility includes upholding code quality, ensuring smooth collaboration, and fostering an open-source community. These guidelines outline the expectations and conventions for maintainers.

### General principles

- **Use maintainer privileges wisely**
  - Do not approve or merge changes you do not fully understand.
  - If you’d like to understand a PR better, ask questions rather than making assumptions.

- **Responsibilities for reviewing**
  - Maintainers are expected to participate in code reviews. Not all maintainers are expected to review every PR, but each PR should have at least one maintainer review it, and more complex ones likely benefit from multiple reviewers.
  - When a PR is opened by a maintainer, that person should identify at least one other maintainer to review it and request a review from them on GitHub.
  - When a PR is opened by a non-maintainer, it's expected that maintainers will work with each other to identify a primary reviewer and possibly secondary reviewers.
  - If a maintainer was assigned to a PR but is unable to review the PR for any reason, they should unassign themselves and request that another maintainer take over the review.
  - Even if you aren't the primary reviewer, you are still encouraged to leave comments on PRs. More eyes on a PR generally results in higher-quality code.

- **Responsibilities for merging**
  - If a maintainer opens a PR, that person is responsible for merging it after it has been approved.
  - For PRs from non-maintainers, the primary reviewer is responsible for merging the PR. If there are outstanding nitpicks or unresolved discussions, consult the author before merging.

- **Responsibilities for production issues**
  - Maintainers are ultimately responsible for ensuring that changes will not cause issues in production.
  - Mistakes happen. If there _is_ an issue after a change is deployed to production, a maintainer is responsible for resolving it.
    - For a PR opened by a maintainer, the author is responsible for resolving any issues. The author should understand that reviewing is done on a best-effort basis.
    - For a PR opened by a non-maintainer, the primary reviewer is responsible for resolving any issues.

- **Taking over abandoned PRs**
  - If a PR appears abandoned, another maintainer may choose to take it over. That maintainer then assumes responsibility for responding to feedback and ultimately merging.
  - Use your best judgment when deciding to take over a PR. For larger PRs, consider reaching out to the original author first. For smaller PRs, it's likely acceptable to fix things up and merge without the original author's input.
  - If you make significant changes, seek review from the original author or another maintainer.

### Code review guidelines

- **Self review**
  - It's almost always very valuable for an author to review their own code before requesting a PR from others. This gives the author a chance to catch any mistakes and clarify their own understanding of the code.
  - Self review is also a good opportunity for the author to add comments to the PR for other reviewers. For example, the author may want to highlight specific changes that are particularly important or may be difficult to understand.

- **Review comments**
  - Be kind and respectful. Remember that the author is a person who has put time and effort into this work.
  - Be constructive and helpful. If you're requesting a non-obvious change, explain why it's necessary to help the author understand the code better and provide context for future maintainers.
  - Err on the side of leaving more comments than fewer. This generally helps result in a higher-quality product and a better experience for the author.
  - Small, subjective suggestions ("nits") are acceptable in reviews, but don't be unnecessarily pedantic.
  - Give extra scrutiny to changes that would be difficult to undo later, such as changes to the database schema or public APIs.
  - It is acceptable to approve a PR and still leave comments. The expectation is that these comments will be addressed by the PR author before the PR is merged.

- **Addressing code review comments**
  - All code review comments should be addressed before merging.
  - Addressing a comment does not always mean making a change. It may involve:
    - Explaining why a change is unnecessary. Ideally, wait for the reviewer to acknowledge this before considering the comment to be addressed.
    - Deferring a fix to a fast-follow PR and explicitly stating that in a comment.
    - For non-critical issues, opening an issue to track the need for a change in the future.
  - Use your best judgment to determine whether a comment has been sufficiently addressed.

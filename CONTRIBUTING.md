# Contributing to PrairieLearn

Thanks for your interest in contributing to PrairieLearn!

## Before you start to code

If you're making a small enhancement, fixing a typo, or updating some documentation, you can jump ahead without getting any maintainers involved first. Onward!

If you want to make a larger change, such as implementing a new feature, changing an API, or introducing a new [element](./docs/elements.md), you should first start a discussion with the maintainers to make sure that your change would ultimately be accepted. This can be in the form of a GitHub issue or discussion, or for really big features, you can open a PR with an [RFC](./rfcs/). The maintainers will work with you to answer any questions, fill in any gaps, and ensure that your proposed change will integrate well into PrairieLearn.

## Setup

Before you start contributing, you'll need to [fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) the repo.

Once you've forked, you'll need to clone your fork and set up your development environment. Depending on your preferred workflow, you can [develop inside of a Docker container](./docs/installingLocal.md) that has all the dependencies pre-installed, or you can [develop "natively" directly on your computer](./docs/installingNative.md).

## Development

You're now ready to start implementing your changes!

The aforementioned setup documentation also includes instructions on starting a server, running tests, and running the linters.

The [dev guide](./docs/dev-guide.md) is currently quite long and dense, but it contains a lot of information about our preferences, conventions, and code structure. Also note that there has been a push to update existing code to use a new set of patterns and best practices, you can find some guidelines in [this Discussion post](https://github.com/PrairieLearn/PrairieLearn/discussions/8874).

If you get stuck, reach out to the friendly folks in the `#pl-dev` channel on the [PrairieLearn Slack](https://go.illinois.edu/PrairieLearnSlack)!

## Opening a pull request

We follow the [GitHub flow](https://docs.github.com/en/get-started/quickstart/github-flow) for all changes:

- You should work on a distinct branch, not `master`. While this isn't strictly necessary for forks, it's helpful if you want to be working on multiple independent changes at the same time.
- When committing your changes, use a short but meaningful commit message, e.g. `fix rate limiting` instead of `fix`.
- Once you're happy with your changes, [open a pull request (PR)](https://docs.github.com/en/articles/creating-a-pull-request).
  - You should include a reasonable amount of information with your pull request, such as a summary of what changes you made and why they were made.
  - For changes that impact UI, it can be helpful to include screenshots and screen recordings.
  - If applicable, include instructions on how to manually test or verify your change.
  - If the change you're making will resolve an existing issue, you should [link the issue to the pull request](https://docs.github.com/en/github/managing-your-work-on-github/linking-a-pull-request-to-an-issue) so that the issue is closed automatically once the pull request is merged.
  - For larger changes (assuming you have already discussed your proposals with the development team, as discussed above), you should break down your changes into smaller, self-contained changes that can be more easily reviewed and tested.
- Monitor the [GitHub status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks). If they fail, you should check the output to see why. You may need to fix a broken test, adjust the formatting of your code, or fix a lint error.
- Like many open-source projects, we require you to "sign" a contributor license agreement (CLA) prior to accepting any contributions. When you open your first pull request, a bot will prompt you to leave a comment stating that you accept the terms of [our CLA](https://github.com/PrairieLearn/cla).
- One or more PrairieLearn maintainers will review your PR. You should be prepared to engage with the maintainers to answer questions, update code, etc.
- Once the PR is in a satisfactory state, a maintainer will approve and merge your change! :tada:

## Using your changes in production

After your changes have been merged to `master`, a new [`prairielearn/prairielearn` Docker image](https://hub.docker.com/r/prairielearn/prairielearn) will be built and published to Docker Hub. If you're developing course content locally, you can then run `docker pull prairielearn/prairielearn` to access the new image.

Usually, your changes will be deployed to all production instances of PrairieLearn within a week. Watch the `#announce` Slack channel to see when your change has been deployed. If it's been several weeks since your PR has been merged and your changes still haven't been deployed, feel free to reach out in the `#pl-dev` Slack channel.

Note that the cadence of deploys may be impacted by typical academic calendars. That is, we may deploy fewer changes less often during December or May when final exams are in session.

# Course management best practices

This page is to discuss best practices for writing and maintaining questions in
large courses. This techniques described here are a mix of standard software
engineering practices applied to PrairieLearn, along with tips specific to
working with certain features specific to PrairieLearn.

## Motivation

As described in the [course documentation page](course.md), a course is stored
in a Git repository with a specific layout. As such, a large course with
many course instances and a large bank of questions is comparable to
a large codebase in terms of the maintenance burden. Accordingly, many
developer tools meant to manage large codebases can be applied to
PrairieLearn courses. Throughout this page, we will use the terms "course"
and "repository" interchangeably.

The techniques described here are primarily continuous integration (CI)
practices. For more information about these techniques outside of the
PrairieLearn ecosystem, see [this page](https://www.atlassian.com/continuous-delivery/continuous-integration).

**Note**: All of the examples used in this page will be written assuming course
repositories are hosted on GitHub, and using CI through GitHub actions. This
may not always be the case in the future, but the general principles apply
regardless of the repository hosting platform.

## Technical Challenges

We will first outline the specific technical challenges that this

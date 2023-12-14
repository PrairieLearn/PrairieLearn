# Course management best practices

This page is to discuss best practices for writing and maintaining questions in
large courses. This techniques described here are a mix of standard software
engineering practices applied to PrairieLearn, along with tips specific to
working with certain features specific to PrairieLearn.

This can be viewed as a more advanced version of the
[course documentation page](course.md), as working knowledge of
the structure of courses is necessary for understanding this documentation.

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

The most important feature of PrairieLearn from a course maintenance
standpoint is that, although most configuration files are read by
the platform each time that a sync is performed, this is not true
of the files related to question content (HTML and Python). This
means that breaking changes to a question are only be visible
when the question is next opened, and may be the result of editing
files not local to that question. In addition,

The following are common situations that tools described in this
page are designed to solve:
- Code shared between multiple questions is refactored in a way
that changes the interface. Questions requiring the old interface
may not display errors until they are next opened.
- Code as part of a randomized question is invalid but only
reachable in rare variants.
- An instructor wishes to write questions with similar backend
logic but different starting configurations
- Invalid JSON or Python code is merged

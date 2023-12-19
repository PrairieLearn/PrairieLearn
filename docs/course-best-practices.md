# Course management best practices

This page is to discuss best practices for writing and maintaining questions in
large courses. This techniques described here are a mix of standard software
engineering practices applied to PrairieLearn, along with tips specific to
working with certain features specific to PrairieLearn.

### Notes

- All of the examples used in this page will be written assuming course
  repositories are hosted on GitHub, and using CI through GitHub actions. This
  may not always be the case in the future, but the same general principles apply
  regardless of the repository hosting platform.
- Although other configurations are possible, the import
  behavior in Python is sensitive to the directory structure.
  Thus, for ease of presentation, we will assume a specific folder structure and
  CI configuration. This should work in the vast majority of situations.

## Background

This can be viewed as a more advanced version of the
[course documentation page](course.md) and the
[question runtime environment](questionRuntime/index.md),
as working knowledge of the course directory structure and question
code execution is necessary for understanding this documentation.
We will also assume basic familiarity with managing a course in a corresponding
GitHub repository instead of only using the web interface.

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

## Technical Challenges

The most important feature of PrairieLearn from a course maintenance
standpoint is that, although most JSON configuration files are read by
the platform each time that a sync is performed, this is not true
of the files related to question content (HTML and Python). This
means that breaking changes to a question are only be visible
when the question is next opened, and may be the result of editing
files not local to that question.

The following are common situations that tools described in this
page are designed to solve:

- Code shared between multiple questions is refactored in a way
  that changes the interface. Questions requiring the old interface
  may not display errors until they are next opened.
- Python code as part of a randomized question is invalid but only
  reachable in rare variants.
- An instructor wishes to write questions with similar backend
  logic but different starting configurations.
- Invalid JSON or Python code is merged to a course, but no
  errors are displayed until all affected questions are opened.

The common source of these issues is that the affected files are
not always executed by PrairieLearn when they are first added to
a repository. Accordingly, the primary role of the CI integration will
be to statically analyze and execute certain files on each commit.
The CI configuration can be changed to run on specific branches and
on pull requests.

## Directory layout

The following is an extension of the directory layout from the
[course documentation page](course.md#directory-layout), with additional
files for CI configuration. Some folders are omitted.

```text
exampleCourse
+-- .github
|   +-- workflows       # Directory holding configurations for each CI workflow.
|       `-- ci.yml
+-- infoCourse.json     # course specification (see below)
+-- questions           # all questions for the course (see other doc)
|   `-- ...
|   `-- ...
+-- elements            # custom HTML elements for the course
|   +-- element1
|       `-- ...
`-- serverFilesCourse   # files only accessible from code on the server (see other doc)
    `-- secret1.js
```

### Files

Here is a breakdown of what each file does. This is meant to be a general overview,
detailed file contents will be shown in later sections.

- `ci.yml`: The configuration file for the CI workflow.
- ``

## GitHub Actions

In this section, we will provide a sample `ci.yml` configuration file and discuss
some of the basics of using GitHub Actions in PrairieLearn. This is not meant
to be a comprehensive discussion of GitHub Actions. For that, please refer
to the [GitHub Actions Documentation](https://docs.github.com/en/actions).

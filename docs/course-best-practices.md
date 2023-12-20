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
- Code maintenance and development practices are inherently coupled together. As
  such, this page will include configurations for local course content development
  in VSCode. For more details on local development, see the
  [local course development documentation](installing.md).

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
|       `-- python-ci.yml
|       `-- json-ci.yml
+-- .vscode             # Directory holding configurations for VSCode.
|   +-- extensions.json
|   +-- settings.json
+-- questions
|   `-- ...
|   `-- ...
+-- elements
|   +-- element1
|       `-- element1.py # Python controller file for element1.
|       `-- ...
+-- serverFilesCourse
|   +-- type_stubs      # Additional type hints for mypy.
|       `-- prairielearn.pyi
|       `-- ...
|   +-- unit_tests      # Python unit tests to run on Python files in serverFilesCourse.
|       `-- __init__.py
|       `-- conftest.py
|       `-- verify_code.py
|       `-- ...
+-- pyproject.toml      # Config file for Python CI tooling.
+-- requirements.txt    # Required packages for Python CI tooling.
```

### Files

Here is a breakdown of what each notable config file and directory does. This is meant to be
a general overview, detailed file contents will be shown in later sections.

- `.github/workflows`: The directory containing configuration files for CI
  workflows. Detailed discussion in the [GitHub Actions](#github-actions) section.
- `.vscode`: A directory containing config files for VSCode for the course.
  Detailed discussion in the [VSCode config](#vscode-config) section.
- `type_stubs`: A folder holding additional type annotations for mypy (in this case,
  only the stubs for `prairielearn.pyi`).
- `__init__.py`: An empty file required for Python to recognize the serverFilesCourse
  directory structure. More detailed discussion on this will be in the
  [python code execution section](#python-execution-and-folder-structure).
- `verify_code.py`: A file for testing Python code in serverFilesCourse. More
  detailed discussion will be on the section on [Python testing](#testing).
- `conftest.py`: A file containing test fixtures. See the section on [Python testing](#testing).
- `pyproject.toml`: The common configuration file for tooling used in the Python CI workflow.
- `requirements.txt`: File containing packages required for Python CI to run.

## GitHub Actions

In this section, we will provide sample configuration files and discuss
some of the basics of using GitHub Actions in PrairieLearn. This is not meant
to be a comprehensive discussion of GitHub Actions. For that, please refer
to the [GitHub Actions Documentation](https://docs.github.com/en/actions).

### `json-ci.yml`

This is the configuration file for the JSON CI workflow. The validation performed
is only basic JSON syntax validation, but serves as a good minimal example of a
workflow file. This is especially useful for verifying JSON files in large pull
requests.

```yml
name: Check JSON syntax

on:
  # Behavior on pushes, only runs validation on pushes to
  # the master branch and if .json files were changed.
  push:
    branches:
      - master
    paths:
      - '**.json'
  # Runs validation if any .json files are changed in a
  # pull request.
  pull_request:
    paths:
      - '**.json'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check all JSON syntax
        uses: limitusus/json-syntax-check@v1.0.3
        with:
          pattern: "\\.json$"
```

### `python-ci.yml`

This is the configuration file for the Python CI workflow, which is substantially
more complex than the JSON CI. Note that this configuration file only controls
what commands get executed, not the configuration for each individual tool
(flake8, mypy, and pytest). For details on each, see the section on
[Python tooling](#python-tooling).

```yml
name: Test and Verify Python Grading and Utility Code

on:
  # Similar configuration to the json-ci.yml. CI workflow only runs on changes
  # to Python files on commits to the master branch and all pull requests.
  push:
    branches:
      - master
    paths:
      - '**.py'
  pull_request:
    paths:
      - '**.py'
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10']

    steps:
      # Check out repository files and install dependencies.
      - uses: actions/checkout@v3
      - name: Set up Python ${{ matrix.python-version }}
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
      - name: Setup Graphviz
        uses: ts-graphviz/setup-graphviz@v1
        # Python dependencies are installed from the requirements.txt file.
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
        # Run Python code linting with flake8.
      - name: Lint with flake8
        run: |
          flake8p .
        # Run static typechecking with mypy and random file renaming. Detailed discussion on why
        # this is necessary in the section on mypy. Partially written by Eric Huber.
      - name: Static Typechecking with mypy
        run: |
          find questions -type f -name server.py -execdir /bin/bash -c 'mv server.py server_${RANDOM}_${RANDOM}_${RANDOM}_${RANDOM}_${RANDOM}.py' \;
          find questions -type f -name test.py -execdir /bin/bash -c 'mv test.py test_${RANDOM}_${RANDOM}_${RANDOM}_${RANDOM}_${RANDOM}.py' \;
          MYPY_CACHE_DIR=/tmp/mypy_ci_cache
          rm -rf $MYPY_CACHE_DIR
          mkdir -p $MYPY_CACHE_DIR
          mypy --cache-dir $MYPY_CACHE_DIR --config-file pyproject.toml elements questions serverFilesCourse
        # Run Python tests with pytest and produce coverage report.
      - name: Test with pytest
        run: |
          set -o pipefail
          pytest --cache-clear --cov | tee pytest-coverage.txt
        # Add comment on pull request with coverage report.
      - name: Comment coverage
        uses: coroo/pytest-coverage-commentator@v1.0.2
```

## Python Execution and Folder Structure

In this section, we will shed some light on how the folder structure used
in PrairieLearn interacts with the execution of Python code. This can be
viewed as an extension of the documentation on the
[question runtime environment](questionRuntime/index.md).

Because the `serverFilesCourse` directory is present during the execution
of question code in Python, the configuration discussed in this page
is such that individual directories within `serverFilesCourse` will be
treated as regular packages by Python. In particular, this means that
all directories (including subdirectories) containing `.py` files need
to have an `__init__.py` file to be correctly recognized by Python.
See the documentation on [regular packages](https://docs.python.org/3/reference/import.html#regular-packages)
for more detailed discussion.

## Python Tooling

In this section, we will preset sample `pyproject.toml` and `requirements.txt`
files, including discussion of all of the associated Python tooling. First,
here is the `pyproject.toml` file.

```toml
# Using "verify" keyword instead of "test" to avoid conflicts with autograder code.
[tool.pytest.ini_options]
python_files = "verify_*.py"
python_classes = "Verify"
python_functions = "verify_*"
testpaths = "serverFilesCourse/unit_tests"
required_plugins = [
  "pytest-lazy-fixture",
  "pytest-cov",
  "pytest-mock"
]

# For mypy, we just set the Python version and exclude certain autograder files.
[tool.mypy]
python_version = "3.10"
plugins = "numpy.typing.mypy_plugin"
exclude = "/(setup_code|ans)\\.py$"
implicit_optional = true

# List of packages to skip analysis, as they are not available on PyPI or do not
# have type annotations.
[[tool.mypy.overrides]]
module = [
  "pl_helpers.*",
  "pl_unit_test.*",
  "code_feedback.*",
  "pygraphviz.*",
  "networkx.*",
  "matplotlib.*",
  "python_helper_sympy.*"
]
ignore_missing_imports = true


[tool.coverage.run]
# Add in all server files for the course
include = ["serverFilesCourse/*"]
# Omit init files and all test files
omit = [
  "*/__init__.py",
  "*/verify_*",
  "serverFilesCourse/unit_tests/*"
]

[tool.flake8]
count = true
statistics = true
show-source = true
per-file-ignores = [
    # Files related to the Python autograder will often intentionally appear
    # broken in isolation. We'll allow specific errors in these files to
    # account for that.
    #
    # - F401: module imported but unused
    # - F821: undefined name
    # - F841: local variable name is assigned to but never used
    # - E999: SyntaxError
    "questions/**/tests/setup_code.py: F401, F821",
    "questions/**/tests/initial_code.py: F401, F821, E999",
    "questions/**/tests/leading_code.py: F401, F821, F841",
    "questions/**/tests/trailing_code.py: F821, E999",
    "questions/**/tests/ans.py: F821",
]

# Error codes to check for. Can be customized based on course, or left blank
# to check for all violations by default.
select = ["W2", "F", "W6", "E20", "E26"]

# Black compatibility
max-line-length = 88
extend-ignore = ["E203", "W503"]
```

### flake8

Flake8 is a linter.

### mypy

### pytest

## VSCode Config

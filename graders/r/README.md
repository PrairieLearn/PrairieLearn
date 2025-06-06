# `prairielearn/grader-r`

This is a Docker image working as an external grader to be paired with
PrairieLearn. It has been used in the STAT 430 'DSPM' (2018-2020) and [STAT
447](https://stat447.com) (since 2021) courses on _Data Science Programming
Methods_ at the University of Illinois at Urbana-Champaign. However, the
container is perfectly generic and can be used for general R work as well.

It is based on the [Rocker](https://rocker-project.org) containers in order to take
advantage of the prebuilt Ubuntu binaries available for the stable 'long-term support' (LTS)
releases---both current versions of R itself, as well as current CRAN packages.
In the most recent instance, it uses [r2u](https://eddelbuettel.github.io/r2u/)
which offers _all_ of CRAN as fully dependency-resolved .deb binaries for both
(current) LTS releases (as of Summer/Fall 2022 these are 20.04 and 22.04). We also
rely on [r2u](https://eddelbuettel.github.io/r2u/) in the RStudio Server instance
used for the course.

## R Packages Installed

See the Dockerfile for full details but we include:

- `tidyverse` and `data.table` for data manipulation;
- `RUnit`, `testthat` and `tinytest` for testing;
- `microbenchmark`, `rbenchmark` and `bench` for timing;
- `shiny`, `flexdashboard`, `dygraphs` for shiny;

and more. We also include a few command-line applications such as `git` and `sqlite3`.

## File Support

This grader primarily focuses on `.R` files for both student submissions and test files. The `.R` file can be named anything, provided it uses the same name in the test files. Additionally, `.ipynb` notebooks are supported for student submissions (test files must still be `.R` files) with the following caveats:

- the student code must be written in a notebook called `student.ipynb`
- the answer code must be in a single cell of the notebook that starts with the correct `IPYNB_KEY` (see below)
- the test files use `/grade/student/student.R` (not `/student.ipynb`)

## Customizing the grading key

When grading an `ipynb` file, you need to tell the autograder which cells to grade using a specific key, which is a comment starting with `#`. All other cells will be ignored by the grader. A cell using the default key of `#grade` could be as follows:

```r
#grade (write your code in this cell and DO NOT DELETE THIS LINE)
answer <- ...
```

Any text following the key is optional but recommended to remind students to not modify this comment. A custom key can be configured using the `IPYNB_KEY` environment variable in `info.json`:

```json
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-r",
    "timeout": 20,
    "environment": {
      "IPYNB_KEY": "#student_code"
    }
  }
}
```

## Authors

Alton Barbehenn and Dirk Eddelbuettel

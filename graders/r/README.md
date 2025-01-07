## rocker-pl

This is a Docker image working as an external grader to be paired with
PrairieLearn. It has been used in the STAT 430 'DSPM' (2018-2020) and [STAT
447](https://stat447.com) (since 2021) courses on _Data Science Programming
Methods_ at the University of Illinois at Urbana-Champaign. However, the
container is perfectly generic and can be used for general R work as well.

It is based on the [Rocker](https://rocker-project.org) containers in order to take
advantage of the prebuilt Ubuntu binaries available for the stable 'long-term support' (LTS)
releases---both current versions of R itself, as well as current CRAN packages.
In the most recent instance, it uses [r2u](https://eddelbuettel.github.io/r2u/)
which offers _all_ of CRAN as fully depedency-resolved .deb binaries for both
(current) LTS releases (as of Summer/Fall 2022 these are 20.04 and 22.04). We also
rely on [r2u](https://eddelbuettel.github.io/r2u/) in the RStudio Server instance
used for the course.

### R Packages Installed

See the Dockerfile for full details but we include

- tidyverse and data.table for data manipulation;
- RUnit, testthat and tinytest for testing;
- microbenchmark, rbenchmark and bench for timing;
- shiny, flexdashboard, dygraphs for shiny;

and more. We also include a few command-line applications such as `git` and `sqlite3`.

### Authors

Alton Barbehenn and Dirk Eddelbuettel

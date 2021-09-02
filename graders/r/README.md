## rocker-pl

This is a Docker image working as an external grader to be paired with PrairieLearn.  It has been
used in the [STAT 430](https://stat430.com) (2018-2020) and [STAT 447](https://stat430.com) (since
2021) courses on _Data Science Programming Methods_ at the University of Illinois at
Urbana-Champaign. However, the container is perfectly generic and can be used
for general R work as well. 

It is based on the [Rocker](https://rocker-project.org) container `r-ubuntu` in order to take
advantage of the prebuilt Ubuntu binaries available for the stable 'long-term support' (LTS)
releases---both current versions of R itself, as well as current CRAN packages.

### R Packages Installed

See the Dockerfile for full details but we include

- tidyverse and data.table for data manipulation;
- RUnit, testthat and tinytest for testing;
- microbenchmark, rbenchmark and bench for timing;
- shiny, flexdashboard, dygraphs for shiny;

and more. We also include a few command-line applications such as `git` and `sqlite3`.

### Authors

Alton Barbehenn and Dirk Eddelbuettel


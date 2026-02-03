# plr

## What is it?

Helper functions for [PrairieLearn](https://github.com/PrairieLearn/PrairieLearn) and R as used by
[STAT430](https://stat430.com) (during 2018-2020) and now [STAT447](https://stat447.com) along
with [STAT385](https://stat385.org).

## Example Workflow Within the PrairieLearn External Autograder

Here we assume the instructor has created a file called `solution.R` in the `tests` directory
containing the reference answer and that the student has submitted a file called `submission.R`.
See [the PrairieLearn docs](https://docs.prairielearn.com/externalGrading/) for more details

For a question that test the creation of objects, a test file might look like:

```r
# load packages and extensions
library(tinytest)
using(ttdo)

# source student and reference files
std = plr::source_std(file = "submission.R")
ref = plr::source_ref(file = "solution.R")

## @title Does the vector a have the correct length?
## @score 1
expect_equal_with_diff(length(std$a), length(ref$a))

## @title Does the vector b have the class?
## @score 1
expect_equal_with_diff(dim(std$b), dim(ref$b))
```

For a question that test a function, a test file might look like:

```r
# load packages and extensions
library(tinytest)
using(ttdo)

# source student and reference files
std = plr::source_std(file = "submission.R")
ref = plr::source_ref(file = "solution.R")

## @title Does the function return the correct type with default inputs?
## @score 1
expect_equal_with_diff(typeof(std$fun()), typeof(ref$fun()))

## @title Does the function return the correct object when x = 1?
## @score 1
expect_equal_with_diff(std$fun(x = 1), ref$fun(x = 1))

## @title Does the function return the correct object when x is random?
## @score 1
y = sample(2:10, 1)
expect_equal_with_diff(std$fun(x = y), ref$fun(x = y))
```

These two testing patterns can be combined to evaluate many possible R problems.
Additionally, the tests can be grouped arbitrarily (from a single test in each file
to every test in one file) to adapt to the author's preferences.

## Who wrote it?

Dirk Eddelbuettel, Alton Barbehenn, and David Dalpiaz

## Thanks to

Jeroen Ooms for the excellent [unix](https://github.com/jeroen/unix) package, and of course the
whole [PrairieLearn](https://github.com/PrairieLearn/PrairieLearn) team for their system

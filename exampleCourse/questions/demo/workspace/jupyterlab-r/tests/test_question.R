## Package(s) we need

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## @title Does the code evaluate?
## @score 1

answer <- tryCatch(plr::source_and_eval_safe("/grade/student/student.R", NULL, "ag"),
                   warning = function(w) w, error = function(e) e)
runs <- !inherits(answer, "error")
expect_true(runs, 0)

## @title Do we find object 'x'?
## @score 1

## check for 'x'
if (runs) {
    expect_true(exists("x"))
} else {
    expect_true(runs)
}

## @title Does 'x' have correct type?
## @score 1

## check for class of 'x' by comparing to list or data.frame
## (if we test for 'data.frame' in predicate students sees that type in wrong answer
if (runs) {
    correct_class <- inherits(x, "data.frame") || inherits(x, "list")
    expect_true(correct_class)
} else {
    expect_true(runs)
}



## @title Does 'x' have correct length?
## @score 1

## check for length of 'x'
if (runs) {
    expect_equal(length(x), 3)
} else {
    expect_true(runs)
}



## @title Does 'x' contain the names we expect?
## @score 1

if (runs) {
    ## check for names of 'x'
    objnames <- names(x)

    expect_true("ii" %in% objnames &&
                "nn" %in% objnames &&
                "cc" %in% objnames)
} else {
    expect_true(runs)
}



## @title Does 'x' contain the types we expect?
## @score 1

if (runs) {
    ## response could be list or data.frame so enfore list
    x <- as.list(x)
    object_classes <- c(class(x[["ii"]]),
                        class(x[["nn"]]),
                        class(x[["cc"]]))
    
    expect_equal(object_classes, c("integer", "numeric", "character"))
} else {
    expect_true(runs)
}



## @title Do we find 'x' to be as expected?
## @score 2

if (runs) {
    ## we are being cute and support a list and a data.frame, but test only for the latter
    x <- as.data.frame(x)

    ## Reference answer, contains expected_x
    source("/grade/tests/ans.R")

    ## check
    expect_equal(x, expected_x)
} else {
    expect_true(runs)
}

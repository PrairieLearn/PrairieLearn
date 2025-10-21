
library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response evaluated into environment 'answer'
answer <- tryCatch(plr::source_std("student.R"),
                   warning = function(w) w, error = function(e) e)
runs <- !inherits(answer, "error")

## @title Does the code evaluate?
## @score 1

if (runs) {
    expect_true(runs)
} else {
    ## we sub out the path and filename to not show to students, but keep the error message
    msg <- paste0("\n", gsub("/grade/student/student.R:\\d+:\\d+:", "", answer$message))
    expect_equal(msg, "")
}


## @title Do we find object 'x'?
## @score 1

if (runs) {
    ## check for 'x'
    expect_true(exists("x", envir=answer))
} else {
    expect_true(runs)
}

## we also check if 'x' exists
runs <- runs && exists("x", envir=answer)

## @title Does 'x' have correct type?
## @score 1

if (runs) {
    ## check for class of 'x' by comparing to list or data.frame
    ## (if we test for 'data.frame' in predicate students sees that type in wrong answer
    permitted_classes <- c("data.frame", "list")
    correct_class <- is.finite(match(class(answer$x), permitted_classes))
    expect_true(correct_class)
} else {
    expect_true(runs)
}


## @title Does 'x' have correct length?
## @score 1

if (runs) {
    ## check for length of 'x'
    expect_equal_with_diff(length(answer$x), 3)
} else {
    expect_true(runs)
}


## @title Does 'x' contain the names we expect?
## @score 1

if (runs) {
    ## check for names of 'x'
    objnames <- names(answer$x)
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
    x <- as.list(answer$x)
    object_classes <- c(class(x[["ii"]]),
                        class(x[["nn"]]),
                        class(x[["cc"]]))
    expect_equal_with_diff(object_classes, c("integer", "numeric", "character"))
} else {
    expect_true(runs)
}


## @title Do we find 'x' to be as expected?
## @score 2

if (runs) {
    ## we are being cute and support a list and a data.frame, but test only for the latter
    x <- as.data.frame(answer$x)

    ## Reference answer, contains expected_x
    reference <- plr::source_ref("ans.R")

    ## check
    expect_equal_with_diff(x, reference$expected_x)
} else {
    expect_true(runs)
}

## @title Does 'x' have correct type?
## @score 1

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response
plr::source_and_eval_safe_with_hiding("/grade/student/student.R",
                                      NULL,
                                      "ag",
                                      "/grade/tests/ans.R")

## check for class of 'x' by comparing to list or data.frame
## (if we test for 'data.frame' in predicate students sees that type in wrong answer
permitted_classes <- c("data.frame", "list")
correct_class <- is.finite(match(class(x), permitted_classes))
expect_true(correct_class)

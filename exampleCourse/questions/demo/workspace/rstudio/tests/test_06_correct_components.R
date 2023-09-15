## @title Do we find 'x' to be as expected?
## @score 2

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response
plr::source_and_eval_safe_with_hiding("/grade/student/student.R",
                                      NULL,
                                      "ag",
                                      "/grade/tests/ans.R")
## to debug (see console)
##print(str(x))

## we are being cute and support a list and a data.frame, but test only for the latter
x <- as.data.frame(x)

## Reference answer, contains expected_x
source("/grade/tests/ans.R")

## check
expect_equal(x, expected_x)

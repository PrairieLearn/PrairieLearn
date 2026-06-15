## @title Do we find object 'x'?
## @score 1

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response
plr::source_and_eval_safe_with_hiding("/grade/student/student.R",
                                      NULL,
                                      "ag",
                                      "/grade/tests/ans.R")

## check for 'x'
expect_true(exists("x"))

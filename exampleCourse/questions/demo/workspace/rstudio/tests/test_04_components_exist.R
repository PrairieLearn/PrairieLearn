## @title Does 'x' contain the names we expect?
## @score 1

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response
plr::source_and_eval_safe_with_hiding("/grade/student/student.R",
                                      NULL,
                                      "ag",
                                      "/grade/tests/ans.R")

## check for names of 'x'
objnames <- names(x)

## to debug (see console)
##print(objnames)

expect_true("ii" %in% objnames &&
            "nn" %in% objnames &&
            "cc" %in% objnames)

## @title Does 'x' contain the types we expect?
## @score 1

library(tinytest)                       # load testrunner
using(ttdo)                             # enable its 'diffobj' extension

## Get student's response
plr::source_and_eval_safe_with_hiding("/grade/student/student.R",
                                      NULL,
                                      "ag",
                                      "/grade/tests/ans.R")

## response could be list or data.frame so enforce list
x <- as.list(x)
object_classes <- c(class(x[["ii"]]),
                    class(x[["nn"]]),
                    class(x[["cc"]]))

## to debug (see console)
##print(object_classes)

expect_equal(object_classes, c("integer", "numeric", "character"))

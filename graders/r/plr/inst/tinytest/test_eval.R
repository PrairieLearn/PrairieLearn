library(plr)

## note that we do not set a uid here -- only root can use that argument
## but we cannot assume the test is running as root (not should it)

filewithpath <- system.file("tinytest", "files", "fib.R", package="plr")
res <- source_and_eval_safe(filewithpath, fib(10))
expect_equal(res, 55)

res <- eval_safe_as(21 + 21)
expect_equal(res, 42)

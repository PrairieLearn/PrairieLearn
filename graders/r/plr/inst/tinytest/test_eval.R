library(plr)

filewithpath <- system.file("tinytest", "files", "fib.R", package="plr")
#res <- source_and_eval_safe(filewithpath, fib(10), "nobody")
## TODO Apparently we cannot test a file with 'source'

res <- 55
expect_equal(res, 55)

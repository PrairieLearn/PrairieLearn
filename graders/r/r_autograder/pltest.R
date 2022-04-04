## Simple-yet-good enough runner for R questions
##
## Alton Barbehenn and Dirk Eddelbuettel, 2019 - 2021

result <- tryCatch({

    ## Set seed for control over randomness (change every day)
    set.seed(as.integer(Sys.Date()))

    ## Directory with test files
    tests_dir <- "/grade/tests"

    ## Get question information on available points and displayed title
    question_details <- plr::get_question_details(tests_dir)

    ## Run tests in the test directory
    cat("[pltest] about to call tests from", getwd(), "\n")
    test_results <- as.data.frame(tinytest::run_test_dir(tests_dir,
                                                         verbose = Sys.getenv("DEBUG", "off") == "on"))

    ## Aggregate test results and process NAs as some question may have exited
    res <- merge(test_results, question_details, by = "file", all = TRUE)
    ## Correct answers get full points, other get nothing
    res$points <- ifelse( !is.na(res$result) & res$result==TRUE,  res$max_points, 0)
    ## For false answer we collate call and diff output (from diffobj::diffPrint)
    res$output <- ifelse( !is.na(res$result) & res$result==FALSE,
                         paste(res$call, res$diff, sep = "\n"), "")
    score <- base::sum(res$points) / base::sum(res$max_points) # total score

    ## Columns needed by PL
    res <- res[, c("name", "max_points", "points", "output")]

    ## output
    list(tests = res, score = score, succeeded = TRUE)
},
warning = function(w) list(tests = plr::message_to_test_result(w), score = 0, succeeded = FALSE),
error = function(e) list(tests = plr::message_to_test_result(e), score = 0, succeeded = FALSE) )

## Record results as the required JSON object
jsonlite::write_json(result, path = "results.json", auto_unbox = TRUE, force = TRUE)

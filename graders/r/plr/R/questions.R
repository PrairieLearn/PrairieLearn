#' Extract question name and score from header
#'
#' This function is inspired by the roxygen2 decoration of source files with content
#' used to create the manual and help files. Here we expect two tags \code{@title}
#' with the displayed title of the question, and \code{@score} with the number of
#' available points.
#'
#' @param dir Directory containing the test files for a question
#' @return A data.frame object with colums name, file, and max_points
get_question_details <- function(dir) {
    files <- list.files(path = dir,
                        pattern = "^test_.*\\.R$",
                        full.names = FALSE)

    rl <- lapply(files, function(f) {
        lines <- readLines(file.path(dir, f))
        title <- gsub(".* @title (.*)", "\\1", lines[grepl("@title", lines)])
        score <- gsub(".* @score (.*)", "\\1", lines[grepl("@score", lines)])
        data.frame(name=title,
                   file=f,
                   max_points=as.numeric(score),
                   stringsAsFactors = FALSE)
    })

    res <- do.call(rbind, rl)
    res
}

#' Run a whole question and report aggregate results
#'
#' This function is the equivalent of the \code{pltest.R} script which, given a directory
#' runs the tests file therein and reports the results in a JSON file for PrairieLearn to
#' consume.
#'
#' @param tests_dir Directory containing the test files for a question
#' @param results_file JSON file into which results are written
#' @return The results data.frame is returned, but the functions is invoked for its
#' side-effect of creating the JSON file
test_question <- function(tests_dir = "/grade/tests/tests", results_file = "results.json") {

    result <- tryCatch({

        ## Get question information on available points and displayed title
        question_details <- get_question_details(tests_dir)

        ## Run tests in the test directory
        #cat("[pltest] about to call tests from", getwd(), "\n")
        test_results <- as.data.frame(tinytest::run_test_dir(tests_dir, verbose = FALSE))

        ## Aggregate test results and process NAs as some question may have exited
        res <- merge(test_results, question_details, by = "file", all = TRUE)
        ## Correct answers get full points, other get nothing
        res$points <- ifelse( !is.na(res$result) & res$result==TRUE,  res$max_points, 0)
        ## For false answer we collate call and diff output (from diffobj::diffPrint)
        res$output <- ifelse( !is.na(res$result) & res$result==FALSE,
                             paste(res$call, res$diff, sep = "\n"), "")
        score <- sum(res$points) / sum(res$max_points) # total score

        ## Columns needed by PL
        res <- res[, c("name", "max_points", "points", "output")]

        ## output
        list(tests = res, score = score, succeeded = TRUE)
    },
    warning = function(w) list(score = 0, succeeded = FALSE, output = w),
    error = function(e) list(score = 0, succeeded = FALSE, output = e) )

    ## Record results as the required JSON object
    jsonlite::write_json(result, path = results_file, auto_unbox = TRUE, force = TRUE)
    invisible(result)
}

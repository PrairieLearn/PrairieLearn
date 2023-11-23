#' Extract question name and score from header
#'
#' This function is inspired by the roxygen2 decoration of source files with content
#' used to create the manual and help files. Here we expect two tags \code{@title}
#' with the displayed title of the question, and \code{@score} with the number of
#' available points. There must be an equal number of both \code{@title} and \code{@score}
#' tags in each file that is parsed, furthermore the test tags are matched sequentially,
#' i.e. the \code{n}'th \code{@score} tag corresponds to the \code{n}'th \code{@title} tag.
#'
#' @param dir Directory containing the test files for a question
#' @param pattern A regular expression identifying test files in the directory
#' @return A data.frame object with columns name, file, and max_points
get_question_details <- function(dir, pattern = "^test.*\\.[rR]$") {
    files <- list.files(path = dir,
                        pattern = pattern,
                        full.names = FALSE)
    files <- sort(files)

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

#' Helper function to format result object returned to PL
#'
#' If there is an error, format the error message so that it can be displayed in
#' the PL question details.
#'
#' @param msg Character variable with the error or warning received
#' @param max_pts Optional numeric variable with maximal attainable points, usual 100
#'
#' @return A data.frame object with four elements as expected by PL
message_to_test_result <- function(msg, max_pts=100) {
    data.frame(name = "Error",
               max_points = max_pts,
               points = 0,
               output = msg$message)
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
    warning = function(w) list(tests = message_to_test_result(w), score = 0, succeeded = FALSE),
    error = function(e) list(tests = message_to_test_result(e), score = 0, succeeded = FALSE) )

    ## Record results as the required JSON object
    jsonlite::write_json(result, path = results_file, auto_unbox = TRUE, force = TRUE)
    invisible(result)
}

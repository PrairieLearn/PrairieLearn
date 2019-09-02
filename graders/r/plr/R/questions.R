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

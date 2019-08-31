#' Wrapper to source a file and safely evaluate an expression
#'
#' We assume all files surrounding the to be evaluated files have different user ids
#' and file modes not allowing the supplied user id to read them.  One way to do that
#' is to just set all files within the evaluation directories to \code{root:root}
#' removing group and others the rights to read (or write or execute). We therefore
#' also \code{chmod} the supplied file back to mode \dQuote{0644} ensuring that
#' the file can be read so that the expression can be evaluated---but nothing else
#' should be in reach,
#'
#' @param file A filename with an R file to be source, typically containing
#' the student code to be evaluated safely
#' @param expr An expression to be evaluate by \code{\link[unix]{eval_safe}},
#' typically the name of the sane of the function containing the student code
#' plus the argument supplied from the test runner
#' @param uid Numeric or character user id identifying the user id with (presumably
#' ower #' privileges) as which the code is running; the numeric uid is obtained
#' via \code{\link[unix]{user_info}} is a character is supplied
#'
#' @return A value of the \code{expr} sourced from \code{file} and evaluated by
#' \code{uid}, or NULL in case of error
#'
#' @examples
#' \dontrun{
#' n <- sample(3:20, 1)         # random payload
#' res <- source_and_eval_safe("code/fib.R", fib(n), "ag")
#' }
source_and_eval_safe <- function(file, expr, uid) {
    if (class(uid) == "character") uid <- user_info(uid)$uid

    if (!file.exists(file)) return(invisible(NULL))

    Sys.chmod(file, mode="0664")
    source(file)

    res <- eval_safe(expr, uid)
}

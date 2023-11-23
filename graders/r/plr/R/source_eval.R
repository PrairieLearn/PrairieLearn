#' Wrapper to source a file and safely evaluate an expression
#'
#' We assume all files surrounding the to be evaluated files have different user ids
#' and file modes not allowing the supplied user id to read them.  One way to do that
#' is to just set all files within the evaluation directories to \code{root:root}
#' removing group and others the rights to read (or write or execute). We therefore
#' also \code{chmod} the supplied file back to mode \dQuote{0644} ensuring that
#' the file can be read so that the expression can be evaluated---but nothing else
#' should be in reach.
#'
#' The \code{source_and_eval_safe_with_hiding} variant can \emph{hide} a given file, for
#' example containing a reference answer, but assigning it to a unique temporary name so
#' that it cannot be sourced.
#'
#' The \code{eval_safe_as} convenience function fetches the (numeric) user id
#' before calling \code{unix::eval_safe}; it is equivalent to \code{source_and_eval_safe}
#' but does not involve a file.
#'
#' Note that you must run these functions as the \sQuote{root} user in order to set the
#' uid.
#'
#' @param file A filename with an R file to be source, typically containing
#' the student code to be evaluated safely.
#' @param expr An expression to be evaluate by \code{\link[unix]{eval_safe}},
#' typically the name of the sane of the function containing the student code
#' plus the argument supplied from the test runner.
#' @param uid Optional numeric or character user id identifying the user id with
#' (presumably lower) privileges as which the code is running; the numeric uid
#' is obtained via \code{\link[unix]{user_info}} is a character is supplied.
#' Note that using this argument requires being the \sQuote{root} user.
#' @param path Optional path to a file that should be hidden before evaluation
#' happens. It is then unhidden on exit.
#'
#' @return A value of the \code{expr} sourced from \code{file} and evaluated by
#' \code{uid}, or NULL in case of error.
#'
#' @examples
#' \dontrun{
#' n <- sample(3:20, 1)         # random payload
#' res <- source_and_eval_safe("code/fib.R", fib(n), "ag")
#' }
source_and_eval_safe <- function(file, expr, uid=NULL) {
    if (!is.null(uid) && class(uid) == "character") uid <- user_info(uid)$uid

    if (!file.exists(file)) return(invisible(NULL))

    oldmode <- file.mode(file)
    Sys.chmod(file, mode="0664")
    source(file)

    res <- eval_safe(expr, uid=uid)
    Sys.chmod(file, mode=oldmode)

    res
}

#' @rdname source_and_eval_safe
eval_safe_as <- function(expr, uid=NULL) {
    if (!is.null(uid) && class(uid) == "character") uid <- user_info(uid)$uid
    res <- eval_safe(expr, uid=uid)
}

#' @rdname source_and_eval_safe
source_and_eval_safe_with_hiding <- function(file, expr, uid=NULL, path=NULL) {
    if (!is.null(uid) && class(uid) == "character") uid <- user_info(uid)$uid

    if (!file.exists(file)) return(invisible(NULL))

    if (!is.null(path) && file.exists(path)) {
        newpath <- tempfile(tmpdir=dirname(path))
        oldpath <- path
        file.rename(oldpath, newpath)
        on.exit(file.rename(newpath, oldpath), add=TRUE)
    }

    oldmode <- file.mode(file)
    Sys.chmod(file, mode="0664")
    source(file)

    res <- eval_safe(expr, uid=uid)
    Sys.chmod(file, mode=oldmode)

    res
}

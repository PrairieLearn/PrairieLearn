#' Source a file as a particular user
#'
#' @param file Path to an R file to be sourced, typically containing student
#' code to be evaluated safely, that is, with lower privileges.
#' @param uid Optional numeric or character user id identifying the user id with
#' (presumably lower) privileges as which the code is running. The corresponding
#' numeric \code{uid} is obtained via \code{\link[unix]{user_info}} when a
#' character \code{uid} is supplied. Note that using this argument requires
#' being the \sQuote{root} user. Default value of \code{"ag"} will source
#' supplied code with privileges that prevent access to sensitive files such as
#' reference solutions.
#'
#' @return An environment containing objects created through sourcing the
#' \code{file} as \code{uid}. Any sourced functions are modified such that
#' future use of the function will be restricted by the lower privileges given
#' to the supplied \code{uid}.
#'
#' @examples
#' \dontrun{
#' std <- source_as(file = "/grade/student/sub.R")
#' ref <- source_as(file = "/grade/student/ans.R")
#' }
source_as <- function(file, uid="ag") {

  # get and set integer uid
  if (!is.null(uid) && class(uid) == "character") uid <- user_info(uid)$uid

  # handle incorrectly specified files
  if (!file.exists(file)) return(invisible(NULL))

  # change file permissions, track original file permissions
  oldmode <- file.mode(file)
  Sys.chmod(file, mode="0664")

  # safely source the file as specified uid to an environment
  sourced_env <- eval_safe({
    temp_env <- new.env()
    source(file, temp_env)
    temp_env
  }, uid = uid)

  # restore original file permissions
  Sys.chmod(file, mode=oldmode)

  for (f in lsf.str(envir = sourced_env)) {
    body(sourced_env[[f]]) <- parse(text = paste("eval_safe(", as.expression(body(env[[f]])), ", uid =", uid, ")"))
  }

  # return sourced objects as an environment
  return(sourced_env)

}

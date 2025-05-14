## Simple-yet-good enough runner for R questions
##
## Alton Barbehenn and Dirk Eddelbuettel, 2019 - 2025

extract_r_code_from_ipynb <- function(file, ipynb_key = "#R") {
  nb <- jsonlite::fromJSON(file, simplifyVector = FALSE)
  content <- ""
  
  for (cell in nb$cells) {
    if (cell$cell_type == "code") {
      code <- paste(unlist(cell$source), collapse = "")
      if (startsWith(trimws(code), ipynb_key)) {
        content <- paste0(content, code, "\n")
      }
    }
  }
  
  return(content)
}

result <- tryCatch({

    debug <- FALSE

    cat("[pltest] Using plr (", format(packageVersion("plr")), "), ",
        "ttdo (", format(packageVersion("ttdo")), "), ",
        "tinysnapshot (", format(packageVersion("tinysnapshot")), ")\n", sep="")

    ## Set seed for control over randomness (change every day)
    set.seed(as.integer(Sys.Date()))

    ## Directory with test files
    tests_dir <- "/grade/tests"
    print(list.files())

    ## Get question information on available points and displayed title
    question_details <- plr::get_question_details(tests_dir)
    if (debug) {
        cat("[pltest] showing question_details\n")
        print(question_details)
        cat("[pltest] done question_details\n\n")
    }

    ## Check for ipynb
    if (file.exists("bin/student.ipynb")) {
        print("[pltest] Found ipynb file")

        # Extract code
        code <- extract_r_code_from_ipynb("bin/student.ipynb")
        if (nchar(code) == 0) {
            warning("No matching R code found in notebook.")
            return(invisible(NULL))
        }

        # Define new R file path inside 'bin'
        student_file <- file.path("bin", "student.R")
        writeLines(code, student_file)
        print(paste("[pltest] Extracted code written to", student_file))

        # Delete the original .ipynb file
        file.remove("bin/student.ipynb")
        print("[pltest] Deleted original ipynb file")
    }
    
    ## Run tests in the test directory
    cat("[pltest] about to call tests from", getwd(), "\n")

    raw_test_results <- tinytest::run_test_dir(tests_dir, verbose = Sys.getenv("DEBUG", "off") == "on")
    if (debug) {
        cat("[pltest] showing raw test_results\n")
        print(raw_test_results)
        print(str(raw_test_results))
        cat("[pltest] done showing raw test_results\n\n")
    }
    
    images <- data.frame(label = character(), url = character())
    nl <- length(raw_test_results)
    ttdos <- data.frame(output = rep(FALSE, nl))
    for (i in seq_len(nl)) {
        ttres <- raw_test_results[[i]] 				# extra tinytest result 'i'
        if (isFALSE(ttres) && inherits(ttres, "ttvd")) { 	# when false and a 'visual diff' result
            ad <- attr(ttres, "diffplot")                   	# where the diff attribute is not NA
            if (!is.na(ad) && grepl("^data:image/png", ad)) {   # and begins as base64 encoded image
                D <- data.frame(label = "Difference Between Submitted and Expected Plot: Red Shows Difference",
                                url = ad) 			# extract the encodes image (in 'ad')
                images <- rbind(images,	D)			# and store in images
            }
        } else if (isFALSE(ttres) && inherits(ttres, "ttdo")) {
            ## For false answer we collate call and diff output (from diffobj::diffPrint) below
            if (debug) cat("[pltest] Flagging 'ttdo'\n")
            ttdos[i, "output"] <- TRUE 				# pass an explicit flag
        }
        raw_test_results[[i]] <- ttres                  	# and update results
    }
    
    test_results <- as.data.frame(raw_test_results)
    test_results <- cbind(test_results, ttdos)
    if (debug) {
        cat("[pltest] showing test_results\n")
        print(test_results)
        cat("[pltest] done showing test_results\n\n")
    }
    
    ## Aggregate test results and process NAs as some question may have exited
    res <- merge(test_results, question_details, by = "file", all = TRUE)
    ## Correct answers get full points, other get nothing
    res$points <- ifelse( !is.na(res$result) & res$result==TRUE,  res$max_points, 0)
    ## For false answer with ttdo support we collate call and diff output (from diffobj::diffPrint)
    res$output <- ifelse( (!is.na(res$result) & res$result==FALSE) | res$output,
                         paste(res$call, res$diff, sep = "\n"), "")
    ## We aggregate the score
    score <- base::sum(res$points) / base::sum(res$max_points) # total score

    if (debug) {
        cat("[pltest] showing str(res)\n")
        print(str(res))
        cat("[pltest] done showing str(res)\n\n")
    }

    
    ## Subset to columns needed by PL
    res <- res[, c("name", "max_points", "points", "output")]

    ## And return components for JSON output
    list(tests = res, score = score, images = images, succeeded = TRUE)
},
warning = function(w) list(tests = plr::message_to_test_result(w), score = 0, succeeded = FALSE),
error = function(e) list(tests = plr::message_to_test_result(e), score = 0, succeeded = FALSE) )

## Record results as the required JSON object
jsonlite::write_json(result, path = "results.json", auto_unbox = TRUE, force = TRUE)

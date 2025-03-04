## Simple-yet-good enough runner for R questions
##
## Alton Barbehenn and Dirk Eddelbuettel, 2019 - 2025

result <- tryCatch({

    debug <- FALSE

    cat("[pltest] Using plr (", format(packageVersion("plr")), "), ",
        "ttdo (", format(packageVersion("ttdo")), "), ",
        "tinysnapshot (", format(packageVersion("tinysnapshot")), ")\n", sep="")

    ## Set seed for control over randomness (change every day)
    set.seed(as.integer(Sys.Date()))

    ## Directory with test files
    tests_dir <- "/grade/tests"

    ## Get question information on available points and displayed title
    question_details <- plr::get_question_details(tests_dir)
    if (debug) {
        cat("[pltest] showing question_details\n")
        print(question_details)
        cat("[pltest] done question_details\n\n")
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

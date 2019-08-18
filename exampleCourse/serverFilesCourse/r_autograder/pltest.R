## Script Requirements ----

# Note: Packages listed here are found on the PrairieLearn R docker image

# Use testthat to test the student code
library("testthat")

# Use stringr to simplify string manipulation
library("stringr")

# Use jsonlite to export the test results under a PrairieLearn format
library("jsonlite")

## Script hierarchy
# /grade
# |- data/
# |- results/
# |- run/                # <--- Working directory
# |- serverFilesCourse/
# |- shared/
# |- student/
# |- tests/

## Run Unit Tests ----

# Automatically test the directory
# This helps avoid needing to build a package on a per question basis.
# To understand testing outside of a package, it's mainly documented in an
# issue ticket: https://github.com/r-lib/testthat/issues/659

# Begin the process of grading each student's code
# Add a capture statement to avoid allowing students to output
# content to console.
log <- capture.output({
    test_data_as_list <- testthat::test_dir("../tests",
                                           reporter = testthat::ListReporter)
})

# Convert from list to a data.frame
test_data = as.data.frame(test_data_as_list)

## Compute Unit Test Correctness ----

# Retrieve question totals from the test description. To facilitate this,
# we assume the format is given as...
#
# NumericPoints: test description
#
# To ensure no issue, we remove all none-numeric values on the left and right
# of the colon separator.

# Obtain the maximum points
test_data$max_points = stringr::str_replace(
    test_data$test,
    pattern = ".*([:digit:]+).*:.*",
    replacement = "\\1"
)

# Convert retrieved maximum points to a numeric value
test_data$max_points = as.numeric(test_data$max_points)

# Calculate the number of points the student received
test_data$earned_points = ifelse(test_data$passed >= 1,
                                 test_data$max_points,
                                 0.0)

# Now, let's aim to extract the description values
test_data$description = stringr::str_replace(
    test_data$test,
    pattern = ".*[:digit:]+.*:[:space:](.*)",
    replacement = "\\1"
)

## Format the Results to Match External Grading Format ----

# Format the results of each inline test.
pl_test_list_format = function(i, x) {
    
    pl_message_statement = function(x) {
        if (isTRUE(x$error)) {
            test_stack = unlist(x$result, recursive = FALSE)
            error_message = if (!is.null(test_stack) && length(test_stack) != 0) {
                format(test_stack[[1]])
            } else {
                "Error message was unrecoverable."
            }
            sprintf("Your code encounted an error.\n %s", error_message)
        } else if (x$failed >= 1) {
            "The code ran but did not produce the correct result."
        } else {
            "No errors!"
        }
    }

    pl_output_statement = function(passed) {
        condition = if(passed == 1) {
            "matched"
        } else {
            "did not match"
        }
        sprintf("Running test...\nYour output %s the expected output.", condition)
    }

    list("name" = paste("Test", i),
         "description" = x[i, "description"],
         "points" = x[i, "earned_points"],
         "max_points" = x[i, "max_points"],
         "output" = pl_output_statement(x[i, "passed"])
         "message" =  pl_message_statement(x[i, , drop = FALSE]),
    )
}


individual_tests = lapply(seq_len(nrow(test_data)), # Individual build results for
                          FUN = pl_test_list_format, # each test
                          x = test_data)

# Provide an overall concatentation of test data
pl_per_test_output = function(i, x) {
    condition = if ( x$passed[i] >= 1 && isFALSE(x$error[i]) ) {
        "passed..."
    } else {
        "failed!"
    }
    sprintf("Test %i %s\n", i, condition)
}

merge_per_test_output =
    paste0(
        sapply(seq_len(nrow(test_data)),
               FUN = pl_per_test_output,
               x = test_data),
        collapse = ""
    )

score = sum(test_data$earned_points)/sum(test_data$max_points)

## Construct the PrairieLearn output format JSON ----

# A list is used instead of a `data.frame`` due to `jsonlite` formatter
# encasing `data.frame` objects within a JSON array.
pl_output_format =
    list(
        "succeeded" = TRUE,
        "score" = score,
        "message" = "Questions were externally graded",
        "output" = paste0(
            "Running tests...\n", merge_per_test_output
        ),
        "tests" = individual_tests
    )

## Export results into the standard output stream ----

# Output is manipulated from the run.sh file into results.json
jsonlite::write_json(
    pl_output_format,     # Pre-formatted data in a data.frame
    path = stdout(),      # Dump into Standard Out (STDOUT) to avoid tracking files.
    pretty = TRUE,        # Make the JSON legible
    auto_unbox = TRUE,    # Remove `[]` around single element in a vector
    force = TRUE,         # Avoid unclassing any item without a direct map
    always_decimal = TRUE # Required due to 0's not being coded as 0.0
)

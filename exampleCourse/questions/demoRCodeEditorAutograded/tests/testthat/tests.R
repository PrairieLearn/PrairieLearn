# Unit tests with `testthat` use the behavior-driven development (BDD) format
# instead of the traditional `test_that` format. This allows for two "contexts"
# to be created.

# In particular, we make the following assumptions about unit tests:

# 1. `describe()` function indicates a single problem steps worth.
# 2. `it()` function describes the specification being assessed.
#
# Avoid using multiple comparisons within the same `describe()`

# Sample test
describe("1", {                               # Specify points per check
    it("Does `fib()` exist?", {               # Description of test
        source("student_answer.R") # Load student submission
        expect_equal(class(fib), "function")  # Perform test
    })
})

describe("1", {
    it("Check fib(0)", {
        source("student_answer.R")
        expect_equal(fib(0), 0)
    })
})

describe("1", {
    it("Check fib(1)", {
        source("student_answer.R")
        expect_equal(fib(1), 1)
    })
})

describe("3", {
    it("Check fib(13)", {
        source("student_answer.R")
        expect_equal(fib(13), 233)
    })
})

describe("3", {
    it("Check fib(n)", {
        source("../student/student_answer.R")
        student_ans = fib(15)
        expect_equal(student_ans, 610)
    })
})

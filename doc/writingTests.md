
# Writing tests

**NOTE:** *Any time you edit or add a test, you need to stop and restart the PrairieLearn server for it to reload the changes. Exam-type tests that choose questions randomly will not change their selections when the test is edited, so you will need to "reset" the test (on the "Assessment Detail" page) to see the changes.*

## Overview

Each test is a single directory in the `tests` folder. The name of the directory is the `tid` (test ID). The directory must contain a single file called `info.json` that describes the test and looks like:

    {
        "type": "RetryExam",
        "title": "Coordinates and Vectors",
        "set": "Quiz",
        "number": 2,
        "allowAccess": [...],
        "options": {...}
    }

* [Format specification for test `info.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testInfo.json)

The `type` of the test controls the way questions are asked, the grading scheme, and the format of the `options` data (see the next section for a list of available types).

## Test naming

Tests are organized into `sets` (e.g., `Homework`, `Quiz`, `Exam`) and within each set the test has a `number`. Additionally, each test has a `title`. Depending on the context, tests are referred to by either a _short name_ or a _long name_. The format of these is:

* Short name = `Set Number` (e.g., `Quiz 2` in the above example).

* Long name = `Set Number: Title` (e.g., `Quiz 2: Coordinates and Vectors` above).

Test numbers can be either integers or strings, allowing `5` as well as `"5A"` and `"5B"`, for example.

## Test types

Each test has a `type`, as listed below. A randomized test is one where each student gets a different set of questions in a randomized order, while a non-randomized test shows all students the same list of questions in the same order. Broadly speaking, randomized tests are designed for exams and non-randomized tests are designed for homeworks.

Type        | Randomized | Options format                                                                                                          | Description
---         | ---        | ---                                                                                                                     | ---
`Basic`     | No         | [`Basic` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsBasic.json)         | A test scored by averaging all attempt scores for each question, then averaging the question scores.
`Adaptive`  | No         | [`Adaptive` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsAdaptive.json)   | An adaptively-scored test that gives and subtracts points based on a mastery estimate for the student.
`Game`      | No         | [`Game` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsGame.json)           | A gamified test that rewards repeated correct answers to questions.
`Exam`      | Yes        | [`Exam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsExam.json)           | A simple exam, where the score is the fraction of correct question answers.
`PracExam`  | Yes        | [`PracExam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsPracExam.json)   | Like `Exam`, but students can generate their own repeated random test instances for practice.
`RetryExam` | Yes        | [`RetryExam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsRetryExam.json) | An exam where students can grade their answers at any time, and retry question for reduced points.

## Randomization algorithm

The test randomization algorithm depends on the test type. Here we only describe the "new" type of randomization for `RetryExam`.

#### `RetryExam` randomization

A `RetryExam` is broken down in to a list of zones, like this:

    "zones": [
        {
            "title": "Easy questions",
            "questions": [
                {"qid": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25]},
                {"qids": ["easyQV1" , "easyQV2"], "points": [10, 3]},
                {"qid": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
            ]
        },
        {
            "title": "Hard questions",
            "questions": [
                {"qids": ["hardQV1", "hardQV2"], "points": [10]}
                {"qid": "reallyHardQ", "points": [10, 10, 10]}
            ]
        }
    ],

* Each zone appears in the given order in the test. Zone titles are optional and are displayed to the student if present.

* Within each zone the question order is randomized.

* A test question can be specified by either a single `qid` or by several `qids`, in which case one of these `qids` is chosen at random. Once the `qid` is determined, then a random variant of that question is selected.

* Rather than continually generating new random variants for each question, the test maintains a pool of possible variants for each question and selects from there. This is done to provide better statistics on question variants. To change this, set the `variantsPerQuestion` option, or set `unlimitedVariants: true` to use unlimited variants.


## Server modes

Each user accesses the PrairieLearn server in a `mode`, as listed below. This can be used to restrict access to tests based on the current mode.

Mode     | When active
---      | ---
`Exam`   | When the user is on a computer in the Computer-Based Testing Facility (CBTF) labs (determined by IP range), or when the user has overridden the mode to be `Exam` (only possible for `Instructor`).
`Public` | In all other cases.
`Default` | An instructor-only mode on the client, which means that the server will act in it's natural mode as determined by client IP. That is, a `Default` mode says to not override the mode to either of the other settings.

## Access control

By default, a test is only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the test's `info.json` file. As an example:

    "allowAccess": [
        {
            "mode": "Public",
            "role": "TA"
        },
        {
            "mode": "Exam",
            "startDate": "2014-07-07T00:00:01",
            "endDate": "2014-07-10T23:59:59"
        },
        {
            "mode": "Exam",
            "uids": ["student1@illinois.edu", "student2@illinois.edu"],
            "startDate": "2014-07-012T00:00:01",
            "endDate": "2014-07-12T23:59:59"
        }
    ],

The above `allowAccess` directive means that this test is available under three different circumstances. First, users who are at least a `TA` can access the test in `Public` mode at any time. Second, any user can access this test in `Exam` mode from July 7th to July 10th. Third, there are two specific students who have access to take the exam at a later date.

The general format of `allowAccess` is:

    "allowAccess": [
        { <accessRule1> },
        { <accessRule2> },
        { <accessRule3> }
    ],

Each `accessRule` is an object that specifies a set of circumstances under which the test is accessible. If any of the access rules gives access, then the test is accessible. Each access rule can have one or more restrictions:

Access restriction | Meaning
---                | ---
`mode`             | Only allow access from this server mode.
`role`             | Require at least this role to access.
`uids`             | Require one of the UIDs in the array to access.
`startDate`        | Only allow access after this date.
`endDate`          | Only access access before this date.

Each access role will only grant access if all of the restrictions are satisfied.

In summary, `allowAccess` uses the algorithm:

    each accessRule is True if (restriction1 AND restriction2 AND restriction3)
    allowAccess is True if (accessRule1 OR accessRule2 OR accessRule3)

## Adding text and links to tests

Tests can include extra optional information to point students towards reference web pages, a PDF formula sheet, or similar files. See [`exampleCourse/midterm1`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/tests/midterm1/) for an example. Extra text appears on the test overview page and is specified in the `options.text` parameter in the test's `info.json` file, like:

    {
        "type": "RetryExam",
        "clientFiles": ["formulas.pdf"],
        "options": {
            "text": "See the <a target=\"_blank\" href=\"<% print(testFile(\"formulas.pdf\")) %>\">PDF formula sheet</a> and the <a target=\"_blank\" href=\"<% print(clientFile(\"index.html\")) %>\">reference webpages</a>."
        }
    }

There are two different ways to link to files:

1. Specific files can be stored in the test directory (like `formaulas.pdf` above). These are linked with the `testFile()` command, and all such files must be explicitly specified in the `clientFiles` list for that test.

2. Files can be made accessible to all tests by putting them in the `clientFiles` directory at the top level of the course (see the [courseConfig](courseConfig.md)). These are linked with the `courseFile()` command. All files in `clientFiles` are available to students at any time (including during exams).

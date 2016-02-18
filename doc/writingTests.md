
# Writing tests

**NOTE:** *Any time you edit or add a test, you need to stop and restart the PrairieLearn server for it to reload the changes. Exam-type tests that choose questions randomly will not change their selections when the test is edited, so you will need to "reset" the test (on the test "Admin" page) to see the changes.*

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
`Game`      | No         | [`Game` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsGame.json)           | A gamified test that rewards repeated correct answers to questions.
`Exam`      | Yes        | [`Exam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/testOptionsExam.json)           | A simple exam, where the score is the fraction of correct question answers.
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

## Test and question instances and resetting tests

PrairieLearn distinguishes between *tests* and *test instances*. A *test* is determined by the code in the `course/tests`, and is something like "Midterm 1". Given a test, PrairieLearn needs to generate the random set of questions and question variants for each student, and it is this selection that is the *test instance* for the student. There is only one copy of each test, but every student has their own test instance. Once test instances have been generated they are stored persistently in the database, and they aren't automatically regenerated if the test code or configuration changes. This is a safety mechanism to avoid having student’s tests deleted/regenerated during an exam just because an instructor makes some minor change (e.g., changing the end date of a test).

However, if you want to force the regeneration of test instances then you can do so with the “reset” button on the test “Admin” page. While writing a test you might need to do this many times. Once a test is live, you should of course be very careful about doing this (basically, don’t do it on a production server once a test is underway).

Just like tests, PrairieLearn also distinguishes between *questions* and *question instances*. The *question* is the code in `course/questions`, which a particular randomly generated variant of the question is stored as a *question instance*. When PrairieLearn generates a test instance for a student, it also generates question instances for all the questions in that test. Just like test instances, the question instances are not automatically regenerated when an instructor changes the question code or configuration. To force a new question instance to be generated, either the test needs to be "reset", or (on a "homework"-type test) the student can get the question wrong and choose "Do this question again", which generates a new random question instance.

## Multiple-instance versus single-instance tests

By default all tests are *single instance*, meaning that each student has exactly one instance of the test that they can complete, and once they have completed that test instance then they cannot do the test again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a *multiple instance* test by setting the option `"multipleInstance": true`. This will allow students to create new test instances and try the whole test repeatedly.

## Server modes

Each user accesses the PrairieLearn server in a `mode`, as listed below. This can be used to restrict access to tests based on the current mode.

Mode     | When active
---      | ---
`Exam`   | When the user is on a computer in the Computer-Based Testing Facility (CBTF) labs (determined by IP range), or when the user has overridden the mode to be `Exam` (only possible for `Instructor`).
`Public` | In all other cases.
`Default` | An instructor-only mode on the client, which means that the server will act in it's natural mode as determined by client IP. That is, a `Default` mode says to not override the mode to either of the other settings.

## Access control

By default, a test is only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the test's `info.json` file.

### Exam example

    "allowAccess": [
        {
            "mode": "Public",
            "role": "TA",
            "credit": 100,
            "startDate": "2014-08-20T00:00:01",
            "endDate": "2014-12-15T23:59:59"
        },
        {
            "mode": "Exam",
            "credit": 100,
            "startDate": "2014-09-07T00:00:01",
            "endDate": "2014-09-10T23:59:59"
        },
        {
            "mode": "Exam",
            "uids": ["student1@illinois.edu", "student2@illinois.edu"],
            "credit": 100,
            "startDate": "2014-09-12T00:00:01",
            "endDate": "2014-09-12T23:59:59"
        }
    ],

The above `allowAccess` directive means that this test is available under three different circumstances and always for full credit. First, users who are at least a `TA` can access the test in `Public` mode during the whole of Fall semester. Second, any user can access this test in `Exam` mode from Sept 7th to Sept 10th. Third, there are two specific students who have access to take the exam on Sept 12th.

### Homework example

    "allowAccess": [
        {
            "mode": "Public",
            "role": "TA",
            "credit": 100,
            "startDate": "2014-08-20T00:00:01",
            "endDate": "2014-12-15T23:59:59"
        },
        {
            "mode": "Public",
            "credit": 110,
            "startDate": "2014-10-12T00:00:01",
            "endDate": "2014-10-15T23:59:59"
        },
        {
            "mode": "Public",
            "credit": 100,
            "startDate": "2014-10-12T00:00:01",
            "endDate": "2014-10-18T23:59:59"
        },
        {
            "mode": "Public",
            "credit": 80,
            "startDate": "2014-10-12T00:00:01",
            "endDate": "2014-10-25T23:59:59"
        },
        {
            "mode": "Public",
            "startDate": "2014-10-12T00:00:01",
            "endDate": "2014-12-15T23:59:59"
        }
    ],

This `allowAccess` directive gives TAs access for then entire semester. Students can see the homework starting on Oct 12th, and the homework for them goes through four different stages: (1) they will earn a bonus 10% if they complete the homework before Oct 15th, (2) they get full credit until the due date of Oct 18th, (3) they can complete the homework up to a week late (Oct 25th) for 80% credit, and (4) they will be able to see the homework but not earn more points until the end of semester (Dec 15th).

### `allowAccess` format

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
`credit`           | Maximum credit as percentage of full credit (can be more than 100).

Each access role will only grant access if all of the restrictions are satisfied.

In summary, `allowAccess` uses the algorithm:

    each accessRule is True if (restriction1 AND restriction2 AND restriction3)
    allowAccess is True if (accessRule1 OR accessRule2 OR accessRule3)

If multiple access rules are satisfied then the highest `credit` value is taken from them. Access rules without an explicit `credit` value have credit of 0, meaning they allow viewing of the test but not doing questions for credit.

**Warning:** Credit other than 100 or 0 is only fully supported by the `Game` and `RetryExam` test types.

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

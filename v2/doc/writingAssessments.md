
# Writing assessments

## Overview

Each assessment is a single directory in the `assessments` folder. The name of the directory specifies the identify of the assessment and must not be changed. The directory must contain a single file called `info.json` that describes the assessment and looks like:

    {
        "type": "RetryExam",
        "title": "Coordinates and Vectors",
        "set": "Quiz",
        "number": 2,
        "allowAccess": [...],
        "options": {...}
    }

* [Format specification for assessment `info.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/assessmentInfo.json)

The `type` of the assessment controls the way questions are asked, the grading scheme, and the format of the `options` data (see the next section for a list of available types).

## Assessment naming

Assessments are organized into `sets` (e.g., `Homework`, `Quiz`, `Exam`) and within each set the assessment has a `number`. Additionally, each assessment has a `title`. Depending on the context, assessments are referred to by either a _short name_ or a _long name_. The format of these is:

* Short name = `Set Number` (e.g., `Quiz 2` in the above example).

* Long name = `Set Number: Title` (e.g., `Quiz 2: Coordinates and Vectors` above).

Assessment numbers can be either integers or strings, allowing `5` as well as `"5A"` and `"5B"`, for example.

## Assessment types

Each assessment has a `type`, as listed below. A randomized assessment is one where each student gets a different set of questions in a randomized order, while a non-randomized assessment shows all students the same list of questions in the same order. Broadly speaking, randomized assessments are designed for exams and non-randomized assessments are designed for homeworks.

Type        | Randomized | Options format                                                                                                          | Description
---         | ---        | ---                                                                                                                     | ---
`Homework`  | No         | [`Homework` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/assessmentOptionsHomework.json)      | A gamified assessment that rewards repeated correct answers to questions.
`Exam`      | Yes        | [`Exam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/assessmentOptionsExam.json) | An exam where students can grade their answers at any time, and retry question for reduced points.

## Question selection algorithm

Questions in an assessment are divided into `zones`. For example:

    "zones": [
        {
            "title": "Easy questions",
            "numberChoose": 2,
            "questions": [
                {"qid": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25]},
                {"qid": "aMediumQ", "points": [10, 3]},
                {"qid": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
            ]
        },
        {
            "title": "Hard questions",
            "questions": [
                {
                    "numberChoose": 2,
                    "alternatives": [
                        {"qid": "hardQV1", "points": [10]},
                        {"qid": "hardQV2", "points": [10]},
                        {"qid": "hardQV3", "points": [10]}
                    ],
                },
                {"qid": "reallyHardQ", "points": [10, 10, 10]}
            ]
        }
    ],

* Each zone appears in the given order in the assessment. Zone titles are optional and are displayed to the student if present (unless `"hideTitle": true`).

* Each zone chooses a random subset of the questions inside it (or all questions, if `numberChoose` is not specified). In `Zone 1: Easy questions` above, two of the questions will be chosen at random, for example [`aMediumQ`, `aSlightlyHarderQ`].

* A zone can contain either `single questions` that are just a single `qid` (e.g., `anEasyQ` in Zone 1 above) or an `alternative group` of questions such as the first grouping in `Zone 2: Hard questions` above. An alternative group chooses a subset of the questions within it (or all questions if `numberChoose` is not specified) before the zone question selection takes place. In Zone 2 a possible choice would be [`hardQV1`, `hardQV2`, `reallyHardQ`].

* Within each zone the question order is randomized (unless `"preserveOrder": true`). Continuing the previous example, Zone 2 might finally have an ordered question list of [`hardQV2`, `reallyHardQ`, `hardQV1`].

* When choosing questions within a zone, the randomization algorithm will balance its choices among the alternative groups as much as possible. That is, a second question will only be chosen from any alternative group after all single questions have been used and one question has been chosen from every alternative group. Similarly, a third question will only be chosen from a given alternative group after every group has contributed two questions, etc. For details, see [`select_assessment_questions.sql`](https://github.com/PrairieLearn/PrairieLearn/blob/master/v2/sprocs/select_assessment_questions.sql).

## Assessment instances, question instances, and resetting

PrairieLearn distinguishes between *assessments* and *assessment instances*. A *assessment* is determined by the code in the `course/assessments`, and is something like "Midterm 1". Given an assessment, PrairieLearn needs to generate the random set of questions and question variants for each student, and it is this selection that is the *assessment instance* for the student. There is only one copy of each assessment, but every student has their own assessment instance. Once assessment instances have been generated they are stored persistently in the database, and they aren't automatically regenerated if the assessment code or configuration changes. This is a safety mechanism to avoid having student’s assessments deleted/regenerated during an exam just because an instructor makes some minor change (e.g., changing the end date of an assessment).

However, if you want to force the regeneration of assessment instances then you can do so with the “reset” button on the assessment “Admin” page. While writing an assessment you might need to do this many times. Once an assessment is live, you should of course be very careful about doing this (basically, don’t do it on a production server once an assessment is underway).

Just like assessments, PrairieLearn also distinguishes between *questions* and *question instances*. The *question* is the code in `course/questions`, which a particular randomly generated variant of the question is stored as a *question instance*. When PrairieLearn generates an assessment instance for a student, it also generates question instances for all the questions in that assessment. Just like assessment instances, the question instances are not automatically regenerated when an instructor changes the question code or configuration. To force a new question instance to be generated, either the assessment needs to be "reset", or (on a "homework"-type assessment) the student can get the question wrong and choose "Do this question again", which generates a new random question instance.

## Multiple-instance versus single-instance assessments

By default all assessments are *single instance*, meaning that each student has exactly one instance of the assessment that they can complete, and once they have completed that assessment instance then they cannot do the assessment again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a *multiple instance* assessment by setting the option `"multipleInstance": true`. This will allow students to create new assessment instances and try the whole assessment repeatedly.

## Server modes

Each user accesses the PrairieLearn server in a `mode`, as listed below. This can be used to restrict access to assessments based on the current mode.

Mode     | When active
---      | ---
`Exam`   | When the user is on a computer in the Computer-Based Testing Facility (CBTF) labs (determined by IP range).
`Public` | In all other cases.

## Access control

By default, an assessment is only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the assessment's `info.json` file.

### Exam example

    "allowAccess": [
        {
            "role": "TA",
            "credit": 100
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

The above `allowAccess` directive means that this assessment is available under three different circumstances and always for full credit. First, users who are at least a `TA` can always access the assessment. Second, any user can access this assessment in `Exam` mode from Sept 7th to Sept 10th. Third, there are two specific students who have access to take the exam on Sept 12th.

### Homework example

    "allowAccess": [
        {
            "role": "TA",
            "credit": 100
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
            "startDate": "2014-10-12T00:00:01"
        }
    ],

This `allowAccess` directive always gives TAs access. Students can see the homework starting on Oct 12th, and the homework for them goes through four different stages: (1) they will earn a bonus 10% if they complete the homework before Oct 15th, (2) they get full credit until the due date of Oct 18th, (3) they can complete the homework up to a week late (Oct 25th) for 80% credit, and (4) they will be able to see the homework but not earn more points thereafter.

### `allowAccess` format

The general format of `allowAccess` is:

    "allowAccess": [
        { <accessRule1> },
        { <accessRule2> },
        { <accessRule3> }
    ],

Each `accessRule` is an object that specifies a set of circumstances under which the assessment is accessible. If any of the access rules gives access, then the assessment is accessible. Each access rule can have one or more restrictions:

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

If multiple access rules are satisfied then the highest `credit` value is taken from them. Access rules without an explicit `credit` value have credit of 0, meaning they allow viewing of the assessment but not doing questions for credit.

## Adding text and links to assessments

Assessments can include extra optional information to point students towards reference web pages, a PDF formula sheet, or similar files. See [`exampleCourse/midterm1`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/assessments/midterm1/) for an example. Extra text appears on the assessment overview page and is specified in the `options.text` parameter in the assessment's `info.json` file, like:

    {
        "type": "RetryExam",
        "clientFiles": ["formulas.pdf"],
        "options": {
            "text": "See the <a target=\"_blank\" href=\"<% print(assessmentFile(\"formulas.pdf\")) %>\">PDF formula sheet</a> and the <a target=\"_blank\" href=\"<% print(clientFile(\"index.html\")) %>\">reference webpages</a>."
        }
    }

There are two different ways to link to files:

1. Specific files can be stored in the assessment directory (like `formaulas.pdf` above). These are linked with the `assessmentFile()` command, and all such files must be explicitly specified in the `clientFiles` list for that assessment.

2. Files can be made accessible to all assessments by putting them in the `clientFiles` directory at the top level of the course (see the [courseConfig](courseConfig.md)). These are linked with the `courseFile()` command. All files in `clientFiles` are available to students at any time (including during exams).

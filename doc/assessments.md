
# Assessments

**NOTE:** *Any time you edit or add a assessment, you need to click the 'Reload' button in the header so that the PrairieLearn server reloads the changes. The 'Reload' button will reset all assessments for the current user.*

## Overview

Each assessment is a single directory in the `assessments` folder. The name of the directory is the `tid` (test ID). The directory must contain a single file called `info.json` that describes the assessment and looks like:

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
`Homework`      | No         | [`Game` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/assessmentOptionsGame.json)           | A gamified assessment that rewards repeated correct answers to questions.
`Exam` | Yes        | [`RetryExam` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/assessmentOptionsRetryExam.json) | An exam where students can grade their answers at any time, and retry question for reduced points.

## `Exam` randomization

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

* Each zone appears in the given order in the assessment. Zone titles are optional and are displayed to the student if present.

* Within each zone the question order is randomized.

* A assessment question can be specified by either a single `qid` or by several `qids`, in which case one of these `qids` is chosen at random. Once the `qid` is determined, then a random variant of that question is selected.

* Rather than continually generating new random variants for each question, the assessment maintains a pool of possible variants for each question and selects from there. This is done to provide better statistics on question variants. To change this, set the `variantsPerQuestion` option, or set `unlimitedVariants: true` to use unlimited variants.

## Assessment and question instances and resetting assessments

PrairieLearn distinguishes between *assessments* and *assessment instances*. A *assessment* is determined by the code in the `course/assessments`, and is something like "Midterm 1". Given a assessment, PrairieLearn needs to generate the random set of questions and question variants for each student, and it is this selection that is the *assessment instance* for the student. There is only one copy of each assessment, but every student has their own assessment instance. Once assessment instances have been generated they are stored persistently in the database, and they aren't automatically regenerated if the assessment code or configuration changes. This is a safety mechanism to avoid having student’s assessments deleted/regenerated during an exam just because an instructor makes some minor change (e.g., changing the end date of a assessment).

However, if you want to force the regeneration of assessment instances then you can do so with the “reset” button on the assessment “Admin” page. While writing a assessment you might need to do this many times. Once a assessment is live, you should of course be very careful about doing this (basically, don’t do it on a production server once a assessment is underway).

Just like assessments, PrairieLearn also distinguishes between *questions* and *question instances*. The *question* is the code in `course/questions`, which a particular randomly generated variant of the question is stored as a *question instance*. When PrairieLearn generates a assessment instance for a student, it also generates question instances for all the questions in that assessment. Just like assessment instances, the question instances are not automatically regenerated when an instructor changes the question code or configuration. To force a new question instance to be generated, either the assessment needs to be "reset", or (on a "homework"-type assessment) the student can get the question wrong and choose "Do this question again", which generates a new random question instance.

## Multiple-instance versus single-instance assessments

By default all assessments are *single instance*, meaning that each student has exactly one instance of the assessment that they can complete, and once they have completed that assessment instance then they cannot do the assessment again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a *multiple instance* assessment by setting the option `"multipleInstance": true`. This will allow students to create new assessment instances and try the whole assessment repeatedly.

## Access control

See the [Access control page](accessControl.md) for details.

By default, a assessment is only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the assessment's `info.json` file.

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

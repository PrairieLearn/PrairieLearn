
# Assessments

**NOTE:** Any time you edit or add an `infoAssessment.json` file on a local copy of PrairieLearn, you need to click the “Load from disk” button in the header so that the local PrairieLearn server reloads the changes.

## Overview

Each assessment is a single directory in the `assessments` folder or any subfolder.  Assessments may be nested in subdirectories of the `assessments` folder.  The assessment directory must contain a single file called `infoAssessment.json` that describes the assessment and looks like:

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "type": "Exam",
    "title": "Coordinates and Vectors",
    "set": "Quiz",
    "number": "2",
    "allowAccess": [],
    "zones": [],
    "comment": "You can add comments to JSON files using this property."
}
```

The assessment ID is the full path relative to `assessments`.

* [Format specification for assessment `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

## Assessment naming

Assessments are organized into `sets` (e.g., `Homework`, `Quiz`, `Exam`) and within each set the assessment has a `number`. Additionally, each assessment has a `title`. Depending on the context, assessments are referred to by either a _short name_ or a _long name_. The format of these is:

* Short name = `Set Number` (e.g., `Quiz 2` in the above example).

* Long name = `Set Number: Title` (e.g., `Quiz 2: Coordinates and Vectors` above).

You can select a set from the list of standardized assessment sets, or create your own.  See [here](course.md/#asses) for details.

## Assessment types

Each assessment has a `type`, as listed below. A randomized assessment is one where each student gets a different set of questions in a randomized order, while a non-randomized assessment shows all students the same list of questions in the same order. Broadly speaking, randomized assessments are designed for exams and non-randomized assessments are designed for homeworks.

Type        | Randomized | Description
---         | ---        | ---
`Homework`  | No         | A gamified assessment that rewards repeated correct answers to questions.
`Exam`      | Yes        | An exam where students can grade their answers at any time, and retry questions for reduced points.



## Assessment and question instances and resetting assessments

PrairieLearn distinguishes between *assessments* and *assessment instances*. An *assessment* is determined by the code in an `assessments` directory, and is something like "Midterm 1". Given an assessment, PrairieLearn needs to generate the random set of questions and question variants for each student, and it is this selection that is the *assessment instance* for the student. There is only one copy of each assessment, but every student has their own assessment instance. The rules for updating assessment instances differ between `Homework` and `Exam` assessments.

**`Exam` assessment updates:** Exam assessment instances are generated when the student starts the exam, and they are never automatically deleted, regenerated, or updated, even when the original assessment is changed in some way. This is a safety mechanism to avoid having students' assessments changed during an exam. However, if you want to force the regeneration of assessment instances then you can do so with the "reset" button on instructor view of the assessment. While writing an assessment you might need to do this many times. Once an assessment is live, you should of course be very careful about doing this (basically, don't do it on a production server once an assessment is underway).

**`Homework` assessment updates:** New questions added to Homeworks will be automatically integrated into student homeworks currently in progress. Updates to `maxPoints` or `maxBonusPoints` will take effect the next time a student grades a question. A student's "points" and "percentage score" will never decrease.


## Multiple-instance versus single-instance assessments

By default all assessments are *single instance*, meaning that each student has exactly one instance of the assessment that they can complete, and once they have completed that assessment instance then they cannot do the assessment again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a *multiple instance* assessment by setting the option `"multipleInstance": true`. This will allow students to create new assessment instances and try the whole assessment repeatedly.


## Auto-closing Exam assessments

By default Exam assessments will auto-close after six hours of inactivity by the student. This generally means that you don't need to explicity close exams that students accidentally did not close when they were done. If you want to prevent auto-closing then you can set `"autoClose": false` as a top-level option in the `infoAssessment.json` file.


## Access control

See the [Access control page](accessControl.md) for details.

By default, an assessment is only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the assessment's `infoAssessment.json` file.


## Student-attached files

Students can attach files to assessments, either by uploading them or by pasting the file contents as text. This can be done on the assessment overview page, or on individual question pages. These files can be viewed by the student anytime they can view the assessment.

The purpose of this is to allow students to take extra notes during exams, for later review. For example, if a student has a Matlab script that they used to solve a question, they could attach it to that question so they can review it later.

This file attachment functionality does not provide a way for students to attach files before an exam starts, so it can't be used for student-provided "formula sheets" on exams.


## Honor code

By default, `Exam` assessments require students to certify their identity and pledge an honor code before starting the assessment:

* I certify that I am `name` and I am allowed to take this assessment.
* I pledge on my honor that I will not give or receive any unauthorized assistance on this assessment and that all work will be my own.

To disable this requirement, set `"requireHonorCode": false` as a top-level option in the `infoAssessment.json` file.

The text of the honor code was based on the University of Maryland's [Honor Pledge](https://www.studentconduct.umd.edu/honor-pledge) and the University of Rochester's [Honor Pledge for Exams](https://www.rochester.edu/college/honesty/instructors/pledge.html). This is a "modified" honor code ([McCabe et al., 2002](https://doi.org/10.1023/A:1014893102151)), as opposed to "traditional" codes that typically also require students to report any violations of the honor code they observe.

## Linking to assessments

Some instructors may wish to publish links that point students directly to their assessments on PrairieLearn. These links may be published in course web pages, LMS systems like Compass or Canvas, or sent to students via email or other messaging platforms. Instructors should note that the URL listed on the browser points to the instructor view of an assessment, which is typically not accessible to students.

The appropriate link to provide to students can be found by opening the "Settings" tab of the Assessment. This page includes, among other useful information, a Student Link that can be provided to students. This link points students directly to the specific assessment, enrolling them automatically in the course if they are not yet enrolled.

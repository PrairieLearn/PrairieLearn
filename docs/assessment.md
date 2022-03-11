# Assessments

**NOTE:** Any time you edit or add an `infoAssessment.json` file on a local copy of PrairieLearn, you need to click the “Load from disk” button in the header so that the local PrairieLearn server reloads the changes.

## Overview

Each assessment is a single directory in the `assessments` folder or any subfolder. Assessments may be nested in subdirectories of the `assessments` folder. The assessment directory must contain a single file called `infoAssessment.json` that describes the assessment and looks like:

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

- [Format specification for assessment `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

## Assessment naming

Assessments are organized into `sets` (e.g., `Homework`, `Quiz`, `Exam`) and within each set the assessment has a `number`. Additionally, each assessment has a `title`. Depending on the context, assessments are referred to by either a _short name_ or a _long name_. The format of these is:

- Short name = `Set Number` (e.g., `Quiz 2` in the above example).

- Long name = `Set Number: Title` (e.g., `Quiz 2: Coordinates and Vectors` above).

You can select a set from the list of [standardized assessment sets](course.md#standardized-assessment-sets) or create your [own](course.md#adding-your-own-assessment-sets).

## Assessment types

Each assessment has a `type`, as listed below. A randomized assessment is one where each student gets a different set of questions in a randomized order, while a non-randomized assessment shows all students the same list of questions in the same order. Broadly speaking, randomized assessments are designed for exams and non-randomized assessments are designed for homeworks.

| Type       | Randomized | Description                                                                                         |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `Homework` | No         | A gamified assessment that rewards repeated correct answers to questions.                           |
| `Exam`     | Yes        | An exam where students can grade their answers at any time, and retry questions for reduced points. |

## Changing question-order randomization

To make `Homework` assessments randomize the question order for each student, set the `"shuffleQuestions": true` option in the `infoAssessment.json` file. This will use a unique-per-course number for each question, so that all students will still get the same question numbers (like #427), but they will not be in order. This makes it easy for students to discuss questions with course staff; they can say “I don't know how to do #427” and everyone will be seeing the same question #427. The main advantage of randomizing question order on Homeworks is to enable data collection on question difficulty and student behavior that is independent of the order in which questions are listed on the assessment.

There is currently no way to disable question order randomization for `Exam` assessments. However, the order of `zones` is fixed (see below), which can be used to control question order.

## Question specification

An assessment is broken down in to a list of zones, like this:

```json
"zones": [
    {
        "title": "Easy questions",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25]},
            {"id": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
        ]
    },
    {
        "title": "Hard questions",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "hardQV1", "points": 10},
            {"id": "reallyHardQ", "points": [10, 10, 10]},
            {
                "numberChoose": 1,
                "points": 5,
                "alternatives": [
                    {"id": "FirstAltQ", "points": 10},
                    {"id": "SecondAltQ"}
                ]
            }
        ]
    }
],
```

- Each zone appears in the given order in the assessment. Zone titles are optional and are displayed to the student if present.

- Within each zone the question order is randomized for `Exam` assessments.

- An assessment question can be specified by either a single `id` or by a list of alternatives, in which case one or more of these alternatives is chosen at random. Once the question `id` is determined, then a random variant of that question is selected. Question alternatives inherit the points of their parent group, if specified.

- If a zone has `maxPoints`, then, of the points that are awarded for answering questions in this zone, at most `maxPoints` will count toward the total points.

- If a zone has `bestQuestions`, then, of the questions in this zone, only `bestQuestions` with the highest number of awarded points will count toward the total points.

## Assessment and question instances and resetting assessments

PrairieLearn distinguishes between _assessments_ and _assessment instances_. An _assessment_ is determined by the code in an `assessments` directory, and is something like "Midterm 1". Given an assessment, PrairieLearn needs to generate the random set of questions and question variants for each student, and it is this selection that is the _assessment instance_ for the student. There is only one copy of each assessment, but every student has their own assessment instance. The rules for updating assessment instances differ between `Homework` and `Exam` assessments.

**`Exam` assessment updates:** Exam assessment instances are generated when the student starts the exam, and they are never automatically deleted, regenerated, or updated, even when the original assessment is changed in some way. This is a safety mechanism to avoid having students' assessments changed during an exam. However, if you want to force the regeneration of assessment instances then you can do so with the "reset" button on instructor view of the assessment. While writing an assessment you might need to do this many times. Once an assessment is live, you should of course be very careful about doing this (basically, don't do it on a production server once an assessment is underway).

**`Homework` assessment updates:** New questions added to Homeworks will be automatically integrated into student homeworks currently in progress. Updates to `maxPoints` or `maxBonusPoints` will take effect the next time a student grades a question. A student's "points" and "percentage score" will never decrease.

## Assessment points

A student's percentage score will be determined by the number of points they have obtained, divided by the value of `maxPoints` (subject to the rules associated to [`credit`](accessControl.md#credit) in assessment access rules).

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "maxPoints": 50,
    "maxBonusPoints": 5,
    ...
}
```

The `maxPoints` determines the number of points a student is required to obtain to get a score of 100%. The percentage score will thus be computed based on the points the student obtained divided by the value of `maxPoints`. If not provided, `maxPoints` is computed based on the maximum number of points that can be obtained from all questions in all zones.

By default, once a student obtains enough points to reach the value of `maxPoints`, any further points do not affect the assessment score. However, if a value is set for `maxBonusPoints` and `credit` is set to 100, the student can obtain additional points, up to a total of `maxPoints + maxBonusPoints`. The percentage is still based on `maxPoints`, so the use of `maxBonusPoints` allows students to obtain a percentage above 100%. If `maxBonusPoints` is set, but `maxPoints` is not provided, then `maxPoints` will be computed by subtracting `maxBonusPoints` from the maximum number of points in all questions.

The choice of using `maxBonusPoints` or a `credit` value above 100 is based on instructor's choice. Additional points based on `maxBonusPoints` are intended to be credited based on extra work, while `credit` above 100 is to be awarded for early completion. It is possible to combine them, and use them together in the same assessment. If `maxBonusPoints` is set while the `credit` is above 100, then the percentage is based on both `maxBonusPoints` and `credit` (see [`credit`](accessControl.md#credit) for details).

## Multiple-instance versus single-instance assessments

By default all assessments are _single instance_, meaning that each student has exactly one instance of the assessment that they can complete, and once they have completed that assessment instance then they cannot do the assessment again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a _multiple instance_ assessment by setting the option `"multipleInstance": true`. This will allow students to create new assessment instances and try the whole assessment repeatedly.

## Enabling group work for collaborative assessments

By default, assessment instances are tied to only one user. By setting `groupWork: true`, multiple students will be able to work on the same assessment instance.
Information about the group configuration can be set in the `infoAssessment.json` file. For example:

```json
{
  "groupWork": true,
  "groupMaxSize": 6,
  "groupMinSize": 2,
  "studentGroupCreate": true,
  "studentGroupJoin": true,
  "studentGroupLeave": true
}
```

| Attribute            | Type    | Default | Description                                        |
| -------------------- | ------- | ------- | -------------------------------------------------- |
| `groupWork`          | boolean | false   | Enable the group work for the assessment.          |
| `groupMaxSize`       | integer | -       | The maximum size of a group (default: no minimum). |
| `groupMinSize`       | integer | -       | The minimum size of a group (default: no maximum). |
| `studentGroupCreate` | boolean | false   | Allow students to create groups.                   |
| `studentGroupJoin`   | boolean | false   | Allow students to join other groups by join code.  |
| `studentGroupLeave`  | boolean | false   | Allow students to leave groups.                    |

Please notice: changing an assessment from group -> individual or vice versa after students have started working on it will cause student work to be lost.

### Instructor options for groupWork

![Instructor group assignment page](groupwork_instructor_interface.png)

Underneath the "Groups" tab in an assessment, instructors have three ways of assigning students to different groups:

1. Uploading a CSV file in the following format:

```
groupName,UID
groupA,one@example.com
groupA,two@example.com
groupB,three@example.com
groupB,four@example.com
```

2. Automatically assigning students, either to fill out existing groups or to make entirely new ones.

3. Copying the group assignments from another assessment.

A copy of the current group assignments can be saved from the "Downloads" tab, under `<assessment>_group_configs.csv`

### Student options for groupWork

![Student perspective for joining a group](groupwork_student_perspective_join.png)

If an instructor does not assign a student to a group, the student will need to join one before opening their assessment instance. They can either create a new one or join an existing group via a join code, which they can get from another classmate.

When calculating a student's grade for a group assessment, PrairieLearn will always use the score of their group's assessment instance.

> Note: Students cannot see eachother's edits in real-time, although this is planned for a future version of PrairieLearn.

![Student view of assessment with groupwork enabled](groupwork_student_perspective_assessment.png)

Students are able to see their groupmates' UIDs, which can become a point of contact to communicate with eachother outside of PrairieLearn. They are also able to leave their group to join a different one.

## Forcing students to complete questions in-order

**WARNING:** We **strongly** discourage the use of this option during exams, as it can be very detrimental to student success. See below for more details.

Certain assessments might be designed to be done linearly, where each question assumes that the student has completed and understood the previous question (e.g., lab worksheets). By default, PrairieLearn allows students to complete questions in any order that they like, but assessments can be configured to not allow students to view future unsolved questions.

To enable these features, set `advanceScorePerc` to any number between 0 and 100 at the `assessment`, `zone`, `alternative group`, or `question` level. An example of what this looks like is below, with boilerplate attributes omitted:

```json
{
  "advanceScorePerc": 100,
  "zones": [
    {
      "advanceScorePerc": 80,
      "questions": [
        {
          "id": "page1",
          "advanceScorePerc": 50
        },
        {
          "id": "page2"
        },
        {
          "id": "page3"
        }
      ]
    }
  ]
}
```

In the above example, a student will need to score at least 50% on `page1` in order to unlock `page2`. Since `page2` has no `advanceScorePerc` set at the question-level, it looks for the next-closest level in the tree where it is defined, which turns out to be the zone level. Thus, `page2` requires a score of at least 80% in order to unlock `page3`. Because `advanceScorePerc` is defined at the zone-level for all questions, the value 100 at the assessment level is never used to determine the minimum advancement score for any question.

If a student uses all of their attempts on a question and cannot submit any more attempts, the next question will automatically unlock, no matter what score they earned on the previous question. This is to prevent students from getting permanently stuck on an assessment, unable to receive further credit.

### Note about exam-type assessments and in-order questions

The `advanceScorePerc` attribute is intended to be used in [group work](#enabling-group-work-for-collaborative-assessments) and assessment types which are indirectly supported, such as worksheets (see [multiple instance assessments](#multiple-instance-versus-single-instance-assessments)). In the interest of allowing students to best demonstrate their knowledge of course material, we **strongly** discourage the use of this feature in actual exams.

## Auto-closing Exam assessments

By default Exam assessments will auto-close after six hours of inactivity by the student. This generally means that you don't need to explicity close exams that students accidentally did not close when they were done. If you want to prevent auto-closing then you can set `"autoClose": false` as a top-level option in the `infoAssessment.json` file.

## Issue reporting

To allow students to report issues with questions (incorrect answers, unclear wording, etc), set the `"allowIssueReporting": true` property in the `infoAssessment.json` file, or set it to `false` to disallow reporting. This option defaults to `true`.

When issue reporting is allowed, students see a button labeled "Report an error in this question" and they can submit a short text form.

![Report an issue button](assessment-report1.png) ![Describe the issue](assessment-report2.png)

Course staff see any reported issues show up on the "Issues" tab.

![Issue report](assessment-report4.png)

## Access control

See the [Access control page](accessControl.md) for details.

By default, an assessment is only accessible to course staff. To allow students to access the assessment, the `allowAccess` option can be used in the assessment's `infoAssessment.json` file.

## Adding text and links to assessments

You can add a `text` property to your `infoAssessment.json`, which can be used to provide additional instructions, formula sheets, etc. You can use EJS syntax to access `clientFilesCourse`, `clientFilesCourseInstance`, and `clientFilesAssessment`.

```json
{
  "text": "<a href=\"<%= clientFilesAssessment %>/formulas.pdf\">Formula sheet</a>"
}
```

See the [`clientFiles` and `serverFiles`](clientServerFiles.md) page for details about making files available to users.

## Student-attached files

Students can attach files to assessments, either by uploading them or by pasting the file contents as text. This can be done on the assessment overview page, or on individual question pages. These files can be viewed by the student anytime they can view the assessment.

The purpose of this is to allow students to take extra notes during exams, for later review. For example, if a student has a Matlab script that they used to solve a question, they could attach it to that question so they can review it later.

This file attachment functionality does not provide a way for students to attach files before an exam starts, so it can't be used for student-provided "formula sheets" on exams.

## Disabling real-time grading

PrairieLearn is designed to give students immediate feedback on their work. However, if you wish to more closely replicate a paper exam experience, you can prevent students from grading their work as they go (what we call "real-time grading").

_Note that students generally expect and benefit from having immediate feedback, so this setting should only be enabled if you have a specific reason for it._

To disable real-time grading for an assessment, add `"allowRealTimeGrading": false` to the assessment's `infoAssessment.json` file. This will hide the "Save & Grade" button on student question pages; only the "Save" button will be available. The "Grade saved answers" button on the assessment overview will also be hidden. Note that real-time grading can only be disabled for `Exam` assessments, as immediate feedback is a core part of the `Homework` experience.

An assessment without real-time grading will not show any score information during the exam. However, if a [time limit](accessControl.md#time-limits) is used then when it runs out the assessment will auto-grade and show students exactly which questions they got correct/incorrect. The same revealing behavior will happen if an instructor manually closes and grades the student assessment. To prevent this, set the [`showClosedAssessment` access rule restriction](accessControl.md#showinghiding-closed-assessments).

Disabling real-time grading changes a lot of fundamental details of how PrairieLearn is used. To account for that, the student assessment overview page displays less information about points and grading than for usual exams.

Here is the assessment page for a normal exam with real-time grading enabled:

![Normal assessment](assessment-grading-normal.png)

Here is the assessment page for an open exam with real-time grading disabled:

![Open assessment with real-time grading disabled](assessment-grading-disabled-open.png)

Compared to the normal assessment, there are a number of differences:

- A warning explaining that real-time grading has been disabled is shown
- Total points is listed as a number, not as an "X/Y" score
- The percentage bar is not displayed
- The "Best submission" column is renamed to "Submission status"
- The "Available points" column has been removed
- The "Awarded points" column has been renamed to "Points" and only shows the max points

Here is the assessment page for a closed exam with real-time grading disabled:

![Closed assessment with real-time grading disabled](assessment-grading-disabled-closed.png)

Note that after the exam has closed and been graded, more information about points will be visible.

## Limiting the number of attempts for each question

The number of times each student will be allowed to attempt each question can be set in different ways, depending on the type of question and assessment.

For assessments with type "Exam", each student will only be presented with a single variant of each question. The number of attempts will be determined by the `points` setting: if there is a single `points` value there will be a single attempt at the question; if `points` is set to a list of points, then there will be one attempt for each value in that list. In other words, the number of attempts is determined based on the number of values in the list of points.

For assessments with type "Homework", students will be presented with an unlimited number of attempts for each question. By default, every new attempt corresponds to a different variant of the question, unless:

- the question is set to [`"singleVariant": true` in the question configuration file](question.md#the-singleVariant-option-for-non-randomized-questions). In this case, students will get unlimited attempts for the same variant.

- the `triesPerVariant` setting is set as below. In this case, the student will have the set number of attempts to correctly answer the question. Once the student answers the question correctly, or the number of tries per variant is exhausted, the student will be given the option to try a new variant.

```json
"zones": [
    {
        "questions": [
            {"id": "singleAttemptQ", "points": 10},
            {"id": "tryOncePerVar", "points": 10},
            {"id": "tryThreeTimesPerVar", "points": 10, "triesPerVariant": 3}
        ]
    }
],
```

## Limiting the rate at which answers can be graded

Practice is important in learning and there should be room for mistakes and learning from them. Immediate feedback can help as it can give feedback despite the limited human resources. However, to prevent mindless trial-and-error problem solving, controlling resubmissions can be an effective tool ([Ihantola et. al., Review of Recent Systems for Automatic Assessment of Programming Assignments](https://dl.acm.org/doi/pdf/10.1145/1930464.1930480)).

One way to limit the amount of feedback provided to students is to limit the rate at which graded submissions are allowed. This can be done by using the `gradeRateMinutes` setting. If set, this value indicates how long a student needs to wait after grading a question to resubmit a new answer to the same question for grading. Students are still able to save a submission, but are not able to grade until either the waiting time has elapsed, or when they close the assesment. By default, this value is set to 0, which means that there is no limit.

The `gradeRateMinutes` value can be set for each specific question in the assessment. It can also be set for a zone or the full assessment, in which case it will apply individually to each question in the zone or assessment. In other words, if the assessment has a grading rate set, once a student submits an answer for grading in one question, they have to wait to submit new answers to that question, but they are able to grade other questions in the meantime.

```json
"zones": [
    {
        "gradeRateMinutes": 30,
        "questions": [
            {"id": "canOnlySubmitEvery30minutes", "points": 10},
            {"id": "canOnlySubmitEvery60minutes", "points": 10, "gradeRateMinutes": 60},
            {"id": "canSubmitAnytime", "points": 10, "gradeRateMinutes": 0}
        ]
    }
],
```

## Honor code

By default, `Exam` assessments require students to certify their identity and pledge an honor code before starting the assessment:

- I certify that I am `name` and I am allowed to take this assessment.
- I pledge on my honor that I will not give or receive any unauthorized assistance on this assessment and that all work will be my own.

To disable this requirement, set `"requireHonorCode": false` as a top-level option in the `infoAssessment.json` file.

The text of the honor code was based on the University of Maryland's [Honor Pledge](https://www.studentconduct.umd.edu/honor-pledge) and the University of Rochester's [Honor Pledge for Exams](https://www.rochester.edu/college/honesty/instructors/pledge.html). This is a "modified" honor code ([McCabe et al., 2002](https://doi.org/10.1023/A:1014893102151)), as opposed to "traditional" codes that typically also require students to report any violations of the honor code they observe.

## Linking to assessments

Some instructors may wish to publish links that point students directly to their assessments on PrairieLearn. These links may be published in course web pages, LMS systems like Compass or Canvas, or sent to students via email or other messaging platforms. Instructors should note that the URL listed on the browser points to the instructor view of an assessment, which is typically not accessible to students.

The appropriate link to provide to students can be found by opening the "Settings" tab of the Assessment. This page includes, among other useful information, a Student Link that can be provided to students. This link points students directly to the specific assessment, enrolling them automatically in the course if they are not yet enrolled.

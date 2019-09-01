
# Assessments

**NOTE:** Any time you edit or add an `infoAssessment.json` file on a local copy of PrairieLearn, you need to click the “Load from disk” button in the header so that the local PrairieLearn server reloads the changes.

## `infoAssessment.json` file

Each assessment is a single directory in the `assessments/` folder. The directory must contain a single file called `infoAssessment.json` that describes the assessment and looks like:

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "type": "Exam",
    "title": "Coordinates and Vectors",
    "set": "Quiz",
    "number": "2",
    "allowAccess": [],
    "zones": []
}
```

Property | Type | Description
--- | --- | ---
`uuid` | string | Unique identifier (UUID v4). E.g., `"8b4891d6-64d1-4e89-b72d-ad2133f25b2f"`. These can be obtained from https://www.uuidgenerator.net (Required; no default)
`type` | string | Either `”Homework”` or `”Exam”`.  (Required; no default)
`title` | string | The title of the assessment (e.g., `”Derivatives and integrals”`). (Required; no default)
`set` | string | Which assessment set this belongs to (e.g., `”Quiz”`, `”Practice Quiz”`). (Required; no default)
`number` | string | The number of the assessment within the set (e.g., `”1”`, `”2B”`). (Required; no default)
`allowAccess` | array | List of access rules. (Optional; default: no student access)
`zones` | array | Specification of zones and questions. (Optional; default: none)
`text` | string | HTML text shown on the assessment overview page. (Optional; default: none)
`multipleInstance` | boolean | Whether to allow students to create whole new attempts at the entire assessment.(Optional; default: `false`)
`maxPoints` | number | The maximum points that can be earned. (Optional; default: sum of zone max points)
`shuffleQuestions` | boolean | Whether to randomize the question order (Homework only). (Optional; default: `false`)
`autoClose` | boolean | Whether to automatically close the assessment after 6 hours of inactivity (Exams only).  (Optional; default: `true`)
`allowIssueReporting` | boolean | Whether to allow students to report question issues. (Optional; default: `true`)
`constantQuestionValue` | boolean | Whether to disable the question value boost on correct solutions (Homework only). (Optional; default: `false`)

For more details, see the [format specification for `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

## `type`: Assessment types

Each assessment has a `type`, which must be either `”Homework”` or `”Exam”`. Broadly speaking, Homeworks are designed for formative learning and allow students to infinitely retry different random variants of questions. Exams, on the other hand, are designed for measuring student knowledge and give each student just one variant of each question, with limited retries.

Type        | Description
---         | ---
`Homework`  | Designed for formative learning, with infinite attempts at different random variants of questions. A persistent student can eventually get 100%.
`Exam`      | Designed for measuring student knowledge, with limited attempts at single variants of questions. Students will typically not get 100%.

## Example Homework assessment

FIXME

## Example Exam assessment

FIXME

## `title`, `set`, and `number`: Assessment naming

Each assessment has a `title` describing its topic. Additionally, assessments are organized into `sets` (e.g., `Homework`, `Quiz`, `Exam`) and within each set the assessment has a `number`. Depending on the context, assessments are referred to by either an _abbreviation_, a _short name_ or a _long name_. The format of these is:

* Abbreviation = `[Set abbreviation][Number]` (e.g., `Q2` to mean the second quiz).

* Short name = `[Set] [Number]` (e.g., `Quiz 2`).

* Long name = `[Set] [Number]: [Title]` (e.g., `Quiz 2: Coordinates and Vectors`).

The allowable set names are specified in the [`courseInfo.json`](course.md#assessment-sets) file.

The `type` of an assessment does not have to correspond to the `set` it is in, but these are generally compatible. For example, `”type”: “Homework”` assessments normally have `”set”: “Homework”` or `”set”: “Machine Problem”`. On the other hand, `”type”: “Exam”` assessments normally have `”set”: “Quiz”`, `”set”: “Exam”`, or similar.

## `allowAccess`: Access control

See the [Access control page](accessControl.md) for details.

By default, an assessment is only accessible to `Instructor` users. Add access rules to make it available to students.

## `zones`: The list of questions on the assessment

An assessment is broken down in to a list of zones, each of which contains a list of question slots, like this:

```json
"zones": [
    {
        "title": "Easy questions",
        "questions": [
            {"id": "anEasyQ", "points": [10]},
            {"id": "aSlightlyHarderQ", "points": [5, 2]}
        ]
    },
    {
        "title": "Hard questions",
        "questions": [
            {"id": "hardQV1", "points": [5]},
            {"id": "reallyHardQ", "points": [5, 5, 5]},
            {“id”: “hardestQV3”, “points”: [3, 2, 1, 0.5, 0.2]}
       ]
    }
],
```

Zone Property | Type | Description
--- | --- | ---
`title` | string | The title of the zone. (Optional; default: none)
`questions` | array | The list of slots for questions and question alternatives within the zone. (Optional; default: none)
`numberChoose` | integer | Number of questions to select for each student from this zone. (Optional; default: select all)
`maxPoints` | number | Limit on the number of points that can be earned from this zone. (Optional; default: sum of question max points)
`bestQuestions` | integer | Only this many questions in the zone will count towards the total points (highest-point questions will count). (Optional; default: use all questions)

Zone specification details are in the [format specification for `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

## `questions`: Slots for questions and question alternatives

Each zone has a list of *slots* given by the `questions` array. Each slot contains either a single question `id`:

```json
{"id": "hardQV1", "points": 10}
```

Or a slot can contain a *question alternative list*:

```json
{
    "numberChoose": 1,
    "points": 5,
    "alternatives": [
        {"id": "FirstAltQ"},
        {"id": "SecondAltQ"}
    ]
}
```

Slot property | Type | Description
--- | --- | ---
`points` | number or array | The number of points for this question. Can be a number (e.g., `10`) or a declining list of points (e.g., `[10, 8, 4]`) for partial credit on Exams. (Required; no default)
`maxPoints` | number | The maximum points available for this question on a Homework that allows multiple attempts for more points. (Optional: default: same as `points`)
`id` | string | The question ID if this slot contains just one question (can’t be specified with `alternatives`). (Optional; default: none)
`alternatives` | array | The list of question alternatives if this slot contains multiple alternative questions (can’t be specified with `id`). (Optional; default: none)
`numberChoose` | integer | If `alternatives` are specified, the number of them to select. (Optional; default `1`).
`triesPerVariant` | integer | The maximum number of attempts allowed for each question variant (on Homeworks). (Optional; default `1`)
`forceMaxPoints` | boolean | Whether to force all students to receive maximum points. See [Regrading](regrading.md). (Optional; default `false`)

Slot specification details are in the [format specification for `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

## Question alternative lists



            "properties": {
                "points": {
                    "$ref": "#/definitions/points"
                },
                "maxPoints": {
                    "$ref": "#/definitions/points"
                },
                "id": {
                    "$ref": "#/definitions/questionId"
                },
                "forceMaxPoints": {
                    "$ref": "#/definitions/forceMaxPoints"
                },
                "triesPerVariant": {
                    "description": "The maximum number of graded submissions allowed for each question instance.",
                    "type": "number",
                    "default": 1
                }
            }

FIXME


Question alternative list specification details are in the [format specification for `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json)

Once the question `id` is determined, then a random variant of that question is selected. Question alternatives inherit the points of their parent group, if specified.

## Assessment instances, question selection, and question order

PrairieLearn distinguishes between *assessments* and *assessment instances*. An *assessment* is determined by the code in an `assessments/` directory, and is something like "Midterm 1". Given an assessment, PrairieLearn needs to select the random list of questions for each student, and it is this selection that is the *assessment instance* for the student. There is only one copy of each assessment, but every student has their own assessment instance.

Choosing the selection of questions for each student proceeds in three steps:

1. For each question slot, either take the single question in that slot or randomly select some of the questions from the list of question alternatives to give the *slot questions*. If `numberChoose` is specified for the slot, randomly select that many questions from the list of alternatives (defaults to 1).

2. For each zone, concatenate the *slot questions* from each slot to form the total list of *available zone questions*. If `numberChoose` is specified for the zone, randomly select that many questions from the available zone questions to give the *zone questions* (defaults to selecting all of the available zone questions). For Exams, randomly shuffle the order of the *zone questions*.

3. Concatenate the *zone questions* from each zone to form the total set of *assessment questions* for the student. This set of questions forms the *assessment instance* for this student.

Each zone appears in the given order in the assessment (this is not randomized for each student). Within each zone the question order is randomized per-student for Exams, but not randomized for Homeworks (but see the [`shuffleQuestions` option](#shufflequestions-question-order-randomization)).

## Computing the points for each question

FIXME

## Computing the total points for an assessment

An assessment consists of several zones, each of which contains several questions. To compute the total assessment points, we proceed in three steps:

1. First take the *question points* earned for each individual question.

2. Within each zone, sum up the *question points* for all the questions to give the *zone points*. This is subject to:

    * If a zone has `maxPoints`, then the zone points are capped at `maxPoints`.

    * If a zone has `bestQuestions`, then, of the questions in this zone, only `bestQuestions` with the highest number of question points will count toward the zone points.

3. Sum up the *zone points* for each zone in the assessment to give the *assessment points*. This is subject to:

    * If the assessment has `maxPoints`, then the assessment points are capped at `maxPoints`.

## `text`: Adding text and links to assessments

See the [`clientFiles` and `serverFiles`](clientServerFiles.md) page for details, and [`exam1` in the example course](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInstances/Sp15/assessments/exam1/) for an example.

## `multipleInstance`: Multiple-instance versus single-instance assessments

By default all assessments are *single instance*, meaning that each student has exactly one instance of the assessment that they can complete, and once they have completed that assessment instance then they cannot do the assessment again. This is the expected behavior for homeworks, quizzes, exams, etc.

For practice exams it is often desirable to make a *multiple instance* assessment by setting the option `"multipleInstance": true`. This will allow students to create new assessment instances and try the whole assessment repeatedly.

## `maxPoints`: Limiting total assessment points

FIXME

## `shuffleQuestions`: Question order randomization

To make `Homework` assessments randomize the question order for each student, set the `"shuffleQuestions": true` option in the `infoAssessment.json` file. This will use a unique-per-course number for each question, so that all students will still get the same question numbers (like #427), but they will not be in order. This makes it easy for students to discuss questions with course staff; they can say “I don't know how to do #427” and everyone will be seeing the same question #427. The main advantage of randomizing question order on Homeworks is to enable data collection on question difficulty and student behavior that is independent of the order in which questions are listed on the assessment.

There is currently no way to disable question order randomization for `Exam` assessments. However, the order of `zones` is fixed, which can be used to control question order. In the limiting case, each zone can contain one questions, which will force an ordering of questions.

## `autoClose`: Auto-closing Exam assessments

By default Exam assessments will auto-close after six hours of inactivity by the student. This generally means that you don't need to explicity close exams that students accidentally did not close when they were done. If you want to prevent auto-closing then you can set `"autoClose": false` as a top-level option in the `infoAssessment.json` file.

## `allowIssueReporting`: Issue reporting

To allow students to report issues with questions (incorrect answers, unclear wording, etc), set the `"allowIssueReporting": true` property in the `infoAssessment.json` file, or set it to `false` to disallow reporting. This option defaults to `true`.

When issue reporting is allowed, students see a button labeled "Report an error in this question" and they can submit a short text form.

![Report an issue button](assessment-report1.png) ![Describe the issue](assessment-report2.png)

Course staff see any reported issues show up on the "Issues" tab.

![Issue report](assessment-report4.png)

## `constantQuestionValue`: Points boost for correct Homework answers

FIXME

## Changing assessments while students are working on them

While it is simplest to not change an assessment while students are working on it, we know that there are sometimes good reasons that changes are needed. For example, a question might need to be removed because it contains an error, new questions might be added, or the points might be changed.

PrairieLearn’s general philosophy is to try and do the right thing in these situations. It will never automatically reduce a student’s total assessment "points" or "percentage score" due to assessment changes. Points that have been given to a student will not be taken away (unless the instructor explicitly edits the student points).

The precise rules for updating assessment instances differ between `Homework` and `Exam` assessments.

**`Exam` assessment updates:** Exam assessment instances are generated when the student starts the exam, and they are never automatically deleted, regenerated, or updated, even when the original assessment is changed in some way. This is a safety mechanism to avoid having students' assessments changed during an exam. However, if you want to force the regeneration of assessment instances then you can do so with the “reset” button on the instructor view of the assessment. While writing and testing an assessment you might need to do this many times. Once an assessment is live, you should of course be very careful about doing this (basically, don’t do it on a production server once a student is working on an assessment).

**`Homework` assessment updates:** New questions added to Homeworks will be automatically integrated into student homeworks that are currently in progress, and removed questions will be removed from students. Updates to `maxPoints` will take effect the next time a student grades a question.

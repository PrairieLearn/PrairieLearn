# Creating an Exam

Exams can be created by defining a new `assessment`.  When you are inside your course instance, select the `Assessments` button on the top of the browser.

* Click the `Add assessment` button on the right.

* A new assessment will be created, and you will be taken to its `Settings` tab.

* Click `Change AID` to modify the Assessment ID.  This could be, for example, `Exam-1`.

* To define the questions appearing in the assessment, you must fill out the `infoAssessment.json` file.

## infoAssessment.json
For full details see [format specification for assessment `infoAssessment.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoAssessment.json).

* The required fields for `infoAssessment.json` are `uuid`, `type`, `title`, `set`, and `number`.  These must be defined in `infoAssessment.json` for the assessment to be valid.

### uuid
The `uuid` is automatically generated, and you do not need to edit it.  If you accidentally change this, you can always [generate a new uuid](https://www.uuidgenerator.net/).

### Assessment type

Each assessment has a `type`, as listed below. A randomized assessment is one where each student gets a different set of questions in a randomized order, while a non-randomized assessment shows all students the same list of questions in the same order. Broadly speaking, randomized assessments are designed for exams and non-randomized assessments are designed for homeworks.

Type        | Randomized | Description
---         | ---        | ---
`Homework`  | No         | A gamified assessment that rewards repeated correct answers to questions.
`Exam`      | Yes        | An exam where students can grade their answers at any time, and retry questions for reduced points.

For an exam, you will most likely want to define the `type` as `Exam`, but there is nothing preventing you from setting it to `Homework`.

### Assessment naming

Assessments are organized into `sets` and within each set the assessment has a `number`.  Additionally, each assessment has a `title`. 

* Assessment `sets` are used to organize assessements into different categories.  Prairielearn has a list of [standardized assessment sets](course.md/#assessments), or you can [create a new set](course.md/#newset).  You will most likely want to use the default `Exam`.

* Each assessment in a given `set` should have its own distinct number, which will appear in the tag in the `Assessments` menu.

* The `title` will be visible to anyone who takes the `assessment`.

## Organizing questions into zones

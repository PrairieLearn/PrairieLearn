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

For an exam, you will most likely want to define the `type` as `Exam`.  For more details about the two assessment types and their behavior see [assessment types](course.md/#assessment_types).

### Assessment naming

Assessments are organized into `sets` and within each set the assessment has a `number`.  Additionally, each assessment has a `title`. 

* Assessment `sets` are used to organize assessements into different categories.  Prairielearn has a list of [standardized assessment sets](course.md/#assessments), or you can [create a new set](course.md/#newset).  You will most likely want to use the default `Exam`.

* Each assessment in a given `set` should have its own distinct `number`, which will appear in the tag in the `Assessments` menu.

* The `title` will be visible to anyone who takes the `assessment`.

## Assessment access
You will want to specify the dates for which the assessment is available to students.  If the exame opens on September 1st, 2021 at 10am and closes at 1pm, you would include:
```json
"allowAccess": [
    {
        "startDate": "2021-09-01T10:00:00",
        "endDate": "2021-09-01T13:00:00",
    }
]
```

## Organizing questions into zones

To complete the assessment, the actual questions must be added.  The `zones` property separates and organizes the questions into blocks of similar topic/difficulty.  The questions are referenced by their `QID` which can be seen in the list under the `Questions` menu on the course instance page.  Here is a short example of what the zones might look like:
```json
"zones": [
    {
        "title": "Easy questions",
        "questions": [
            {"id": "anEasyQuestion", "points": 1},
            {"id": "anotherEasyQuestion", "points": [2, 1]},
            {"id": "aSlightlyHarderQ", "points": [4,2]}
        ]
    },
    {
        "title": "Harder questions",
        "questions": [
            {"id": "hardQuestion", "points": [10,5,1]}
            {"id": "harderQuestion", "points": [12, 12, 6, 3]},
            {"id": "anotherHardQuestion", "points": [15, 15]}
        ]
    }
]
```
In this example, the assessment is divided into two zones "Easy Questions" and "Harder Questions".  For each question, point values have been assigned:

* "anEasyQuestion" is worth 1 point.  Students have only one attempt to answer correctly.

* "anotherEasyQuestion" is worth 2 points if answered correctly on the first attempt.  After one incorrect answer, the student has one more attempt to get 1 point for credit.  "aSlightlyHarderQ" is similar, with the point values doubled.

* Students have 3 attempts for "hardQuestion", with awarded points decreasing each time.

* For "harderQuestion", students have two attempts that will provide the full credit of 12 points.  The third and fourth attempts award partial credit.

* "anotherHardQuestion" provides full credit for the first two attempts, but no partial credit afterwards. 

* The total number of points for the assessment is automatically calculated from `points` (in this case, the exam is worth 44 points).

For more on zones, including more grading options, see [assessment zones and grading](#course.md/zones-grading).

## Example infoAssessment.json
The following is what the complete `infoAssessment.json` would look like for the examples described above:
```json
{
    "uuid": "737a7f3c-e2ac-4d53-912f-e6cf1e1e186f",
    "type": "Exam",
    "title": "Limits and Continuity",
    "set": "Exam",
    "number": "1",
    "allowAccess": [
        {
            "startDate": "2021-09-01T10:00:00",
            "endDate": "2021-09-01T13:00:00",
        }
    ],
    "zones": [
        {
            "title": "Easy questions",
            "questions": [
                {"id": "anEasyQuestion", "points": 1},
                {"id": "anotherEasyQuestion", "points": [2, 1]},
                {"id": "aSlightlyHarderQ", "points": [4,2]}
            ]
        },
        {
            "title": "Harder questions",
            "questions": [
                {"id": "hardQuestion", "points": [10,5,1]}
                {"id": "harderQuestion", "points": [12, 12, 6, 3]},
                {"id": "anotherHardQuestion", "points": [15, 15]}
            ]
        }
    ]
}
``` 

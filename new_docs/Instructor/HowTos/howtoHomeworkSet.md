# Creating a Homework Set

Homeworks can be created by defining a new `assessment`.  When you are inside your course instance, select the `Assessments` button on the top of the browser.

* Click the `Add assessment` button on the right.

* A new assessment will be created, and you will be taken to its `Settings` tab.

* Click `Change AID` to modify the Assessment ID.  This could be, for example, `HW-1`.

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

For a homework assignment, you will most likely want to define the `type` as `Homework`.  For more details about the two assessment types and their behavior see [assessment types](course.md/#assessment_types).

### Assessment naming

Assessments are organized into `sets` and within each set the assessment has a `number`.  Additionally, each assessment has a `title`. 

* Assessment `sets` are used to organize assessements into different categories.  Prairielearn has a list of [standardized assessment sets](course.md/#assessments), or you can [create a new set](course.md/#newset).  You will most likely want to use the default `Homework`.

* Each assessment in a given `set` should have its own distinct `number`, which will appear in the tag in the `Assessments` menu.

* The `title` will be visible to anyone who takes the `assessment`.

## Assessment access
You will want to specify the dates for which the assessment is available to students.  If the homework opens on September 1st, 2021 at 8am and closes on September 8th at 10pm, you would include:
```json
"allowAccess": [
    {
        "startDate": "2021-09-01T08:00:00",
        "endDate": "2021-09-08T22:00:00",
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
            {"id": "anotherEasyQuestion", "points":1, "maxPoints":2},
            {"id": "aSlightlyHarderQ", "points": 2, "maxPoints":4}
        ]
    },
    {
        "title": "Harder questions",
        "questions": [
            {"id": "hardQuestion", "points": 5, "maxPoints": 10},
            {"id": "harderQuestion", "points": 6, "maxPoints": 12},
            {"id": "longQuestion", "points": 15}
        ]
    }
]
```
In this example, the assessment is divided into two zones "Easy Questions" and "Harder Questions".  For each question, point values have been assigned:

* "anEasyQuestion" is worth 1 point.  Students can attempt the question multiple times, and will be credited with 1 point once they have answered correctly.

* "anotherEasyQuestion" is worth 1 point per attempt, for a maximum of 2 points.  Students can attempt the question multiple times, and will receive 1 point for each correct answer.  To get full credit on the question, students must submit 2 correct answers.  This only makes sense if "anotherEasyQuestion" has some randomization; so that students will see more than one variant of the question.  This is one way that instructors can award conceptual understanding, rather than memorization or guessing.

* The other questions are similar: either the student must answer multiple times for full credit (questions 3-5), or full-credit is given for the first correct answer (final question).

* The total number of points for the assessment is automatically calculated from `points` and `maxPoints` (in this case, the homework is worth 44 points).

For more on zones, including more grading options, see [assessment zones and grading](#course.md/zones-grading).

## Example infoAssessment.json
The following is what the complete `infoAssessment.json` would look like for the examples described above:
```json
{
    "uuid": "737a7f3c-e2ac-4d53-912f-e6cf1e1e186f",
    "type": "Homework",
    "title": "Algebra Review",
    "set": "Homework",
    "number": "1",
    "allowAccess": [
        {
            "startDate": "2021-09-01T08:00:00",
            "endDate": "2021-09-08T22:00:00",
        }
    ],
    "zones": [
        {
            "title": "Easy questions",
            "questions": [
                {"id": "anEasyQuestion", "points": 1},
                {"id": "anotherEasyQuestion", "points":1, "maxPoints":2},
                {"id": "aSlightlyHarderQ", "points": 2, "maxPoints":4}
            ]
        },
        {
            "title": "Harder questions",
            "questions": [
                {"id": "hardQuestion", "points": 5, "maxPoints": 10},
                {"id": "harderQuestion", "points": 6, "maxPoints": 12},
                {"id": "longQuestion", "points": 15}
            ]
        }
    ]
}
``` 

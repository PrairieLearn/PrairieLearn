# Creating an assessment

Before you create an assessment, make sure you are in the desired course instance.  For this tutorial, we want to create assessments in the "Fall 2021" course instance we created previously.

* Navigate to the `Assessments` window.

* click the button `Add assessment`.  A new assessment will be created called `New (1)`.

* click the button `Change AID` to change the assessment ID name. In general, we use names such as `Homework1` or `Exam5`.  So let's call this assessment `Homework1`.

* click the `Edit` button next to `infoAssessment.json`.

* The [assessment type](assessment.md#assessment-types) is currently set to `Homework`, so we'll leave it as is.  The other possible [assessment type](#course.md/assessments) is `Exam`.

* change the `title`. We'll call it:
```json
"title": "Math Review",
```

* The next entry, the assessment `set` is used for better organization of the course instance. PrairieLearn has some standardized sets (eg. Homework, Quiz, Exam), and you can also [create your own](course.md#assessment-sets).  We'll leave it as "Homework".

* the `number` entry corresponds to the order of the assessmen within its set. This number will be used to sort the assessments in the `Assessments` page.  Since this is the first assessement, again, we can leave it as 1. 

* `allowAccess` sets the dates in which you want the assessment to be available. Read the documentation about [Access controls](https://prairielearn.readthedocs.io/en/latest/accessControl/) to learn about the different configurations available. In this example, our assessment will be available from 10 p.m. September 1st, until 10 p.m. September 8; the assessment will be worth full-credit during this time:

```json
"allowAccess": [
    {
        "startDate": "2021-09-01T20:00:00",
        "endDate": "2021-09-08T20:00:00",
        "credit": 100
    }
],
```

* in `zones` you should enter the questions to be included in that assessment. We will add two of the questions that we just created:

```json
"zones": [
    {
        "questions": [
            {"id": "sum_two_numbers", "points": 1, "maxPoints": 2},
            {"id": "find_rectangle_area", "points": 2, "maxPoints": 2}
        ]
    }
]
```


* click `Save and sync`.


**Learn more:**

- [Quick reference guide about question structure and PrairieLearn elements](https://coatless.github.io/pl-cheatsheets/pdfs/prairielearn-authoring-cheatsheet.pdf)

- [Different ways to setup an assessment](assessment.md)

- [Detailed list of PrairieLearn elements](elements.md)

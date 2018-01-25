
# FAQ (Frequently Asked Questions)

## How do I give a student access to homeworks or an exam after the semester is over?

You need to give the student access to both the course instance itself for the completed semester as well as the specific assessments within that course instance.

For example, suppose Fall 2017 is the completed semester and it is now Spring 2018. We have one student (`netid@illinois.edu`) that needs to take the final exam from Fall 2017 in February 2018. We will extend the Fall 2017 course instance and final exam access to include February 2018, but only for `netid@illinois.edu`.

First, edit `pl-exp101/courseInstance/Fa17/infoCourseInstance.json` to add a section for `netid@illinois.edu`:
```
    "allowAccess": [
        {
            "startDate": "2017-08-19T00:00:01",
            "endDate": "2017-12-31T23:59:59"
        },
        {
            "uids": ["netid@illinois.edu"],
            "startDate": "2018-02-01T00:00:01",
            "endDate": "2018-02-28T23:59:59"
        }
    ]
```

Second, edit the assessment `pl-exp101/courseInstance/Fa17/assessments/final/infoAssessment.json` to add a section for `netid@illinois.edu`:
```
    "allowAccess": [
        {
            "mode": "Exam",
            "credit": 100,
            "startDate": "2017-12-14T00:00:01",
            "endDate": "2017-12-22T22:10:59"
        },
        {
            "uids": ["netid@illinois.edu"],
            "mode": "Exam",
            "credit": 100,
            "startDate": "2018-02-01T00:00:01",
            "endDate": "2018-02-28T23:59:59"
        }
    ]
```

See [Access control](accessControl.md) for more details.

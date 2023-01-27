# Question Sharing
In order to avoid instructors needing to copy question files in between courses, PrairieLearn provides a way for questions from one course to be used in assessments in other courses.

## Establishing a sharing connection with another course

For security reasons, establishing the connection for one course to share questions with another course requires coordinated action by owners of the course sharing the questions (which we will refer to hereafter as the 'sharing course') and the course that is using the questions that are being shared ('which we will refer to hereafter as the 'consuming course')

**TODO** describe how using the sharing ID works, maybe have a couple of screenshots.

## Sharing Sets

Access to shared questions is controlled through **sharing sets**. A sharing set is a named set of questions which you can share to another course all at once. The sharing set system exists so that course owners may differentially share different sets of their questions. For example, and instructor may want to share some questions only with other courses in their department, and other questions with anyone using PrairieLearn. For security reasons, only course owners are allowed to edit sharing sets and sharing set permissions, and all sharing information is kept exclusively in the database, not in any of the JSON files that declare the course content. Sharing sets are edited from the 'Sharing' tab of the course administration page.

## Importing shared questions

To refer to a question from another course, you simply put the question id (qid) into your `assessmentInfo.json`, prefixed by the `@` symbol and which course it comes from. For example, to use the question `addNumbers` from your own course, you would simply put `"addNumbers"`, but to use the question `addNumbers` from the course `test-course`, you would put `@test-course/addNumbers` into your `assessmentInfo.json`. In the context of the `assessmentInfo.json`, this may look like:

```json
"zones": [
    {
        "title": "Question Sharing Example",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "addNumbers", "autoPoints": [10, 5, 3, 1, 0.5, 0.25]},
            {"id": "@test-course/addNumbers", "autoPoints": [10, 9, 7, 5]}
        ]
    },
]
```

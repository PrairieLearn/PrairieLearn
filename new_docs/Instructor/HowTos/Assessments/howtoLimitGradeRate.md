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

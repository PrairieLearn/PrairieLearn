# How to add bonus points to an assessment

The maximum score of an assessment is defined by the assessment property `maxPoints`. If `maxPoints` is not defined, then its value is calculated by the maximum number of points that can be obtained by summing the [maximum points](addQuestions.md) of all questions in the assessment.

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Add one line to define `maxPoints` and one line to define `maxBonusPoints`, for example:


```json
"maxPoints": 50,
"maxBonusPoints": 5,
"allowAccess": [
    {
        "startDate": "2021-01-19T16:00:00",
        "endDate": "2021-05-19T18:00:00",
        "credit": 100,
    }
]
```

The `maxPoints` determines the number of points a student is required to obtain to get a score of 100%. The percentage score will thus be computed based on the points the student obtained divided by the value of `maxPoints`. By default, once a student obtains enough points to reach the value of `maxPoints`, any further points do not affect the assessment score (and hence students are able to complete an assessment without answering all questions if `maxPoints` is set to be smaller than the sum of all question points).

#### Credit < 100

If `credit` is set to a value less than 100, then the property `maxBonusPoints` has no effect; there are no Bonus Points available in the assessment.

#### Credit = 100

If a value is set for `maxBonusPoints`, the student can obtain additional points, up to a total of `maxPoints + maxBonusPoints`. The percentage is still based on `maxPoints`, so the use of `maxBonusPoints` allows students to obtain a percentage above 100%. If `maxBonusPoints` is set, but `maxPoints` is not provided, then `maxPoints` will be computed by subtracting `maxBonusPoints` from the maximum number of points in all questions. In the above example, students can obtain up to 110% on the assessment.

#### Credit > 100

The choice of using `maxBonusPoints` or a `credit` value above 100 is based on instructor's choice. Additional points based on `maxBonusPoints` are intended to be credited based on extra work, while `credit` above 100 is to be awarded for early completion.  It is possible to combine them, and use them together in the same assessment.  If `maxBonusPoints` is set while the `credit` is above 100, then the percentage is based on both `maxBonusPoints` and `credit` (see [Access Control](../refereces/accessControl.md/#credit) reference page for more details).

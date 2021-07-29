# Setting Points for the Assessment

## Changing the available amount of credit
An instructor can choose the percentage of available credit for a given assessment.  The most straightforward option is to give 100%, but values less than or greater than 100 are allowed.

This is set in the `allowAccess` field in `infoAssessment.json`.  Once you have opened `infoAssessment.json` for editing, you can input:
```json
"allowAccess": [ {"credit": 120} ]
```
This allows 120% total possible credit for the assessment.  How this interacts with the available points in the assessment will be explained in [`Assessment points`](howtoAssessmentPoints.md#Assessment points) below.

## Changing credit for different time periods
You can also use `allowAccess` to set a specific time range for which credit is available.  For example,
```json
"allowAccess": [ 

{
"startDate": "2021-10-01T20:00:00",
"endDate": "2021-10-05T20:00:00",
"credit": 120
} 

{
"startDate": "2021-10-05T20:00:01",
"endDate": "2021-10-10T20:00:00",
"credit": 100
}

{
"startDate": "2021-10-10T20:00:01",
"endDate": "2021-10-15T20:00:00",
"credit": 50
}

{
"startDate": "2021-10-15T20:00:01",
"endDate": "2021-10-20T20:00:00",
"credit": 0
}

]

```
In this example, starting at 8pm on October 1st, 2021, the assessment will be worth 120%, but only until October 5th at 8pm.  At this time (or precisely, 1 second after 8pm) the assessment will be worth 100% until October 10th.  This continues decreasing - 50% October 10-15, and 0% credit between October 15-20.  0% credit allows students to continue working on homework after the due date in order to help prepare for exams.


## Assessment points

Further specification of credit is controlled by Assessment points.

A student's percentage score will be determined by the number of points they have obtained, divided by the value of `maxPoints`.  Additional extra points are determined by the value of `maxBonusPoints`.  Both are properties that are defined in the assessment's `infoAssessment.json` file. 
```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "maxPoints": 50,
    "maxBonusPoints": 5,
    ...
}
```
If `maxPoints` is not defined, then its value is calculated by the maximum number of points that can be obtained from all questions in all zones (see [`points for each question`](howtoAssessmentPoints.md/#question) below.

## How credit is calculated

### Credit < 100

If `credit` is set to a value less than 100 in `allowAccess`, then the property `maxBonusPoints` has no effect; there are no Bonus Points available in the assessment.

### Credit = 100

The `maxPoints` determines the number of points a student is required to obtain to get a score of 100%. The percentage score will thus be computed based on the points the student obtained divided by the value of `maxPoints`. If not provided, `maxPoints` is computed based on the maximum number of points that can be obtained from all questions in all zones.

By default, once a student obtains enough points to reach the value of `maxPoints`, any further points do not affect the assessment score. However, if a value is set for `maxBonusPoints`, the student can obtain additional points, up to a total of `maxPoints + maxBonusPoints`. The percentage is still based on `maxPoints`, so the use of `maxBonusPoints` allows students to obtain a percentage above 100%. If `maxBonusPoints` is set, but `maxPoints` is not provided, then `maxPoints` will be computed by subtracting `maxBonusPoints` from the maximum number of points in all questions.


### Credit > 100
The choice of using `maxBonusPoints` or a `credit` value above 100 is based on instructor's choice. Additional points based on `maxBonusPoints` are intended to be credited based on extra work, while `credit` above 100 is to be awarded for early completion.  It is possible to combine them, and use them together in the same assessment.  If `maxBonusPoints` is set while the `credit` is above 100, then the percentage is based on both `maxBonusPoints` and `credit` (see [`credit`](course.md/#credit) for details).

## Controlling points for each question

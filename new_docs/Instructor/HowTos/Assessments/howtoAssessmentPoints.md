## Assessment points

A student's percentage score will be determined by the number of points they have obtained, divided by the value of `maxPoints` (subject to the rules associated to [`credit`](accessControl.md#credit) in assessment access rules).

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "maxPoints": 50,
    "maxBonusPoints": 5,
    ...
}
```

The `maxPoints` determines the number of points a student is required to obtain to get a score of 100%. The percentage score will thus be computed based on the points the student obtained divided by the value of `maxPoints`. If not provided, `maxPoints` is computed based on the maximum number of points that can be obtained from all questions in all zones.

By default, once a student obtains enough points to reach the value of `maxPoints`, any further points do not affect the assessment score. However, if a value is set for `maxBonusPoints`, the student can obtain additional points, up to a total of `maxPoints + maxBonusPoints`. The percentage is still based on `maxPoints`, so the use of `maxBonusPoints` allows students to obtain a percentage above 100%. If `maxBonusPoints` is set, but `maxPoints` is not provided, then `maxPoints` will be computed by subtracting `maxBonusPoints` from the maximum number of points in all questions.

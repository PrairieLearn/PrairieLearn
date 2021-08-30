# How to setup varying credit and time interval options

You can use multiple access rules with different credit and/or time interval. For example, you may want to assign an early deadline for extra credit, or a late deadline for reduced credit.

* From the `Assessments` page, select the assessment you want to modify the access rules.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `allowAccess` property:

```json
"allowAccess": [
  {
    "startDate": "2021-10-01T20:00:00",
    "endDate": "2021-10-05T20:00:00",
    "credit": 110
  },
  {
    "startDate": "2021-10-01T20:00:00",
    "endDate": "2021-10-10T20:00:00",
    "credit": 100
  },
  {
    "startDate": "2021-10-01T20:00:00",
    "endDate": "2021-10-15T20:00:00",
    "credit": 50
  },
  {
    "startDate": "2021-10-01T20:00:00",
    "endDate": "2021-12-10T20:00:00",
    "credit": 0,
  }
]
```

* Click `Save and sync`.

In the example above, the assessment will be open at 8pm on October 1st, 2021. Students can complete the assessment for 120% credit until October 5th at 8pm, for 100% credit until October 10th at 8pm or for 50% credit until October 15th at 8pm. Adding an access rule for 0% credit allows students to continue working on homework after the due date for later practice, but not for credit. See [Access Control](../references/accessControl.md#credit) reference page for more details about credit.

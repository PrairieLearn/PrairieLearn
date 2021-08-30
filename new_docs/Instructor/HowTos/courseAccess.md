# How to setup course access rules

You can define different access rules at the course instance and assessment levels. For more details, go the [Access Control](../references/accessControl.md) reference page. Here we will show you change the dates in which the course instance is available.

* Select the course instance from the toggle dropdown at the top bar menu.

* Go to the `Files` tab.

* Click the `Edit` button next to the `infoCourseInstance.json` file.

* Modify the `allowAccess` property with the appropriate `startDate` and `endDate`, for example:

```json
"allowAccess": [
    {
        "startDate": "2021-01-19T16:00:00",
        "endDate": "2021-05-19T18:00:00"
    }
]
```

* Click `Save and sync`.

* Navigate back to the course instance by clicking the course instance name from the top bar menu.

Students will be able to enroll in the course instance during this time interval. Note that this will not grant students access to any assessments in the course instance. Instead, assessment access should be granted for each individual assessment.

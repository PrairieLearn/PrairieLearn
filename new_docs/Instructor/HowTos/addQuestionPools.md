# How to create question pools

When using assessment `"type": "Exam"`, you can define a group (pool) of questions that will be used to generate an individual assessment.  

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `zones` property, for example:

```json
"zones": [
    {
        "questions": [
            {
                "numberChoose": 1,
                "points": 5,
                "alternatives": [
                    {"id": "Q1Alt1"},
                    {"id": "Q1Alt2"}
                ]
            },
            {
                "numberChoose": 2,
                "points": [8,4,1],
                "alternatives": [
                    {"id": "Q2Alt1"},
                    {"id": "Q2Alt2"},
                    {"id": "Q2Alt3"}
                ]
            }]
    }
],
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

The example above will create one assessment with three questions. One of the questions will be randomly selected from the pool `["Q1Alt1", "Q1Alt2"]` and two others will be selected from the pool  `["Q2Alt1", "Q2Alt2", "Q2Alt3"]`.

Note that the order of the questions in `"type": "Exam"` is shuffled. If you want to provide questions in a specified order, you need to use different [`zones`](howtoZones.md).

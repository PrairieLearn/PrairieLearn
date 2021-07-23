# Organizing assessments with Zones

An assessment is broken down in to a list of zones, like this:

```json
"zones": [
    {
        "title": "Easy questions",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25]},
            {"id": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
        ]
    },
    {
        "title": "Hard questions",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "hardQV1", "points": 10},
            {"id": "reallyHardQ", "points": [10, 10, 10]},
            {
                "numberChoose": 1,
                "points": 5,
                "alternatives": [
                    {"id": "FirstAltQ", "points": 10},
                    {"id": "SecondAltQ"}
                ]
            }
        ]
    }
],
```

* Each zone appears in the given order in the assessment. Zone titles are optional and are displayed to the student if present.

* Within each zone the question order is randomized for `Exam` assessments.

* An assessment question can be specified by either a single `id` or by a list of alternatives, in which case one or more of these alternatives is chosen at random. Once the question `id` is determined, then a random variant of that question is selected. Question alternatives inherit the points of their parent group, if specified.

* If a zone has `maxPoints`, then, of the points that are awarded for answering questions in this zone, at most `maxPoints` will count toward the total points.

* If a zone has `bestQuestions`, then, of the questions in this zone, only `bestQuestions` with the highest number of awarded points will count toward the total points.

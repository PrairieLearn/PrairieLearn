# Assessments

How to create assessments to fit all your educational goals


## Homework with unlimited attempts


## Limiting the number of attempts for each question

The number of times each student will be allowed to attempt each question can be set in different ways, depending on the type of question and assessment.

For assessments with type "Exam", each student will only be presented with a single variant of each question. The number of attempts will be determined by the `points` setting: if there is a single `points` value there will be a single attempt at the question; if `points` is set to a list of points, then there will be one attempt for each value in that list. In other words, the number of attempts is determined based on the number of values in the list of points.

For assessments with type "Homework", students will be presented with an unlimited number of attempts for each question. By default, every new attempt corresponds to a different variant of the question, unless:

* the question is set to [`"singleVariant": true` in the question configuration file](question.md#the-singleVariant-option-for-non-randomized-questions). In this case, students will get unlimited attempts for the same variant.

* the `triesPerVariant` setting is set as below. In this case, the student will have the set number of attempts to correctly answer the question. Once the student answers the question correctly, or the number of tries per variant is exhausted, the student will be given the option to try a new variant.

```json
"zones": [
    {
        "questions": [
            {"id": "singleAttemptQ", "points": 10},
            {"id": "tryOncePerVar", "points": 10},
            {"id": "tryThreeTimesPerVar", "points": 10, "triesPerVariant": 3}
        ]
    }
],
```

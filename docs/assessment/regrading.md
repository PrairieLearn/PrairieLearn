# Regrading broken questions

Despite all our best efforts, sometimes we put a broken question onto an exam. The recommended procedure for dealing with this situation is:

1. If the error is detected when just a few students have taken the exam, either correct the question, remove it from the exam, or replace it with a new question. Either regrade the broken question with maximum points (see below) or adjust the scores of affected students [by hand](../manualGrading/index.md), perhaps with some correction factor for the added challenge they faced by encountering a broken question.

2. If many students have taken the exam with the broken question then do not attempt to fix it but rather let the exam complete with all students experiencing the same issue. Then afterward regrade the exam with all students being awarded maximum points for the broken question, as described below.

## Regrading limitations

PrairieLearn does not currently support recomputing scores for individual submissions. This means that, if the issue is related to updates in how a score is computed, then there is no automatic process to update scores of students that already completed the assessment. This includes, but is not limited to:

- Changes in the computation of correct answers.
- Changes in the `grade()` or `parse()` functions.
- Changes in the external grader tests.
- Changes in weights of individual elements.
- Changes in element attributes that affect grading, such as `partial-credit` for `pl-checkbox` or `grading-method` for `pl-order-blocks`.
- Changes in the points for a question, alternative group or zone.
- Changes in the points or bonus points for an assessment.
- Adding, removing or replacing questions in an assessment with type Exam.

If, however, the issue is related to a broken question where all students should be awarded maximum points, then there is an automatic process to regrade the assessment and award maximum points for the broken question.

## Regrading by setting `forceMaxPoints` for a question

To award some or all students maximum points for a question during a regrade, edit the `infoAssessment.json` file and set `"forceMaxPoints": true` for any broken questions. For example:

```json title="infoAssessment.json" hl_lines="6 18"
{
  "zones": [
    {
      "title": "Easy questions",
      "questions": [
        { "id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25], "forceMaxPoints": true },
        { "id": "aSlightlyHarderQ", "points": [10, 9, 7, 5] }
      ]
    },
    {
      "title": "Hard questions",
      "questions": [
        { "id": "hardQV1", "points": 10 },
        { "id": "reallyHardQ", "points": [10, 10, 10] },
        {
          "numberChoose": 1,
          "points": 10,
          "alternatives": [{ "id": "FirstAltQ" }, { "id": "SecondAltQ", "forceMaxPoints": true }]
        }
      ]
    }
  ]
}
```

In the example above, the questions `anEasyQ` and `SecondAltQ` will award maximum points to any student who has these questions and is regraded.

After updating the `infoAssessment.json` file, go to the instructor page for the assessment and click the "Regrade all assessment instances" button at the top of the "Assessment instances" box, or use the "Action" menu to regrade a single assessment instance for just one student.

**The `forceMaxPoints` setting only affects assessment instances that are explicitly regraded.** Students who take the exam later are not affected by `forceMaxPoints` while submitting answers. Also, while regrading an assessment instance as the student is still working on it is possible, it may be confusing to the student if they see their points suddenly change during an exam, for example. As such, it is generally recommended to wait until the exam is over before regrading with `forceMaxPoints` to avoid confusion for students.

### Handling questions with alternatives

For questions that all students get on their assessment the above system is straightforward. For questions with alternatives, instructors are encouraged to consider how to handle the regrading in a fair manner. For example, consider the case when `SecondAltQ` is broken in the assessment above. In the above example, we only awarded maximum points to those students who received `SecondAltQ`, while students with `FirstAltQ` did not receive automatic maximum points. However, it may be fairer to give maximum points to all students irrespective of which alternative they received, as follows:

```json title="infoAssessment.json" hl_lines="7"
{
  "zones": {
    "questions": [
      {
        "numberChoose": 1,
        "points": 10,
        "forceMaxPoints": true,
        "alternatives": [{ "id": "FirstAltQ" }, { "id": "SecondAltQ" }]
      }
    ]
  }
}
```

## Regrading questions using score uploads

If the issue is related to updates in the grading process, it is possible to update the grades by [uploading a new score for each submission](../manualGrading/index.md#uploading-the-scores-and-feedback). In such cases, a typical process involves:

- [Downloading the students' current scores and submitted answers](../manualGrading/index.md#downloading-the-students-submitted-answers).
- Calculating the new scores based on the updated grading process. Depending on the scenario, this may involve using spreadsheet formulas or, in more complex cases, writing a script to compute the new scores.
- [Uploading the new scores for each submission](../manualGrading/index.md#uploading-the-scores-and-feedback).

A suggested template for a Python script that can be used to update scores is available in the [PrairieLearn GitHub repository](https://github.com/PrairieLearn/PrairieLearn/blob/master/contrib/regrading_sample.py). This script provides a starting point for reading the downloaded CSV file, but you must implement the logic to compute the new scores based on the updated grading process. The script also includes placeholders for updating feedback and partial scores based on existing information, such as previously executed tests, params, and correct answers. Portions that must be implemented are marked with `TODO` comments, though depending on the logic required for the regrading, you may need to make more extensive changes to the script.

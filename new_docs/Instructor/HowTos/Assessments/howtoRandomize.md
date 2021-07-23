## Changing question-order randomization

To make `Homework` assessments randomize the question order for each student, navigate to the `Settings` tab of your assessment, and edit the `infoAssessment.json` file.  Define a property `shuffleQuestions` and set it equal to `true`:
```json
"uuid": "737a7f3c-e2ac-4d53-912f-e6cf1e1e186f",
"type": "Homework",
"title": "HW Set 1",
"set": "Homework",
"number": "1",
"shuffleQuestions": true,
```

This will use a unique-per-course number for each question, so that all students will still get the same question numbers (like #427), but they will not be in order. This makes it easy for students to discuss questions with course staff; they can say “I don't know how to do #427” and everyone will be seeing the same question #427. The main advantage of randomizing question order on Homeworks is to enable data collection on question difficulty and student behavior that is independent of the order in which questions are listed on the assessment.

There is currently no way to disable question order randomization for `Exam` assessments. However, the order of [zones](course.md/#zones) is fixed, which can be used to control question order.

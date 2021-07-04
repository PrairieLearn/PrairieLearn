

# Regrading broken questions

Despite all our best efforts, sometimes we put a broken question onto an exam. The recommended procedure for dealing with this situation is:

- If the error is detected when just a small number of students have taken the exam, either correct the question, remove it from the exam, or replace it with a new question. The current options to regrade a broken questions are:

	1. Give the maximum points to all the students that receive the broken question.

	2. Adjust the scores of affected students by hand, perhaps with some correction factor for the added challenge they faced by encountering a broken question.

- If many students have taken the exam with the broken question then do not attempt to fix it but rather let the exam complete with all students experiencing the same issue. Then afterwards regrade the exam with all students being awarded maximum points for the broken question, as described below.


## 1. Regrading a broken question for a given student

If you find a bug in a question, you can fix the question by writing your own grade function in `server.py`. To illustrate the regrading procedure, we use the `demo/calculation` question in the example course. The `question.html` and `server.py` files have been reproduced below.

File `question.html`:

```html
<pl-question-panel>
  <p> Consider two numbers $a = {{params.a}}$ and $b = {{params.b}}$.</p>
  <p> What is the sum $c = a + b$?</p>
</pl-question-panel>

<pl-number-input answers-name="c" comparison="sigfig" digits="3" label="$c=$"></pl-number-input>
```

File `server.py`:

```python
import random, copy

def generate(data):
    # Sample two random integers between 5 and 10 (inclusive)
    a = random.randint(5, 10)
    b = random.randint(5, 10)
    # Put these two integers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b
    # Compute the sum of these two integers
    c = a + b
    # Put the sum into data['correct_answers']
    data['correct_answers']['c'] = c
```

Now suppose we made a typo in `server.py` by writing the last line of the `generate()` function as follows:

```python
data['correct_answers']['c'] = a
```

When solving this question, a student who submits the correct answer (the result of `a + b`) will get their submission marked as incorrect. How do we fix this?

First, we must fix the typo in the `generate()` function to ensure that question variants generated in the future contain no errors. On `Homework` questions that allow students to generate new variants (using the "Try question again" button), all future variants will be graded correctly. Since there is no penalty for generating new variants of a `Homework` question, fixing the typo is probably sufficient in this case.

However, students cannot generate new variants for `Exam` questions or `Homework` questions with `singleVariant="true"`. Unfortunately, fixing the `generate()` function does not fix question variants that have already been generated. To ensure that all question variants are correctly graded in the future, we must write a custom `grade()` function in the `server.py` file as shown below.

```python
import random, copy
import math

def generate(data):
    # Sample two random integers between 5 and 10 (inclusive)
    a = random.randint(5, 10)
    b = random.randint(5, 10)
    # Put these two integers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b
    # Compute the sum of these two integers
    c = a + b
    # Put the sum into data['correct_answers']
    data['correct_answers']['c'] = c

def grade(data):
    # Explicitly compute the correct answer
    c = data['params']['a'] + data['params']['b']

    if data['submitted_answers']['c'] is not None:
        if math.isclose(data['submitted_answers']['c'], c, rel_tol=1e-3, abs_tol=1e-6):
            data['partial_scores']['c'] = {'score': 1, 'weight': 1}
            data['score'] = 1
```

The next time a student submits the correct answer (`a + b`), the question will be marked as correct. This may suffice for `Homework` questions since students are not penalized for making multiple submissions. However, on `Exam` questions, additional submissions may have reduced credit, or students may have run out of attempts. Thus, we may wish to regrade all past submissions using the new `grade()` function.

To regrade all past submissions for a specific student, the instructor can use the `Regrade` functionality on the student assessment instance page. To access this page, go to the "Students" tab in the assessment, then click "Details" in the rightmost column of the row containing the student's information.

As an example, consider a student who made two correct submissions, but ended up receiving 22/25 points because the first submission was mistakenly marked as incorrect before the `server.py` file was fixed.

![](regradingBeforeClick.png)

Upon clicking the `Regrade` button, the custom `grade()` function is called again for all submissions, and the score is adjusted to reflect the number of points the student would have earned if the question had been using the custom `grade()` function all along.

![](regradingAfterClick.png)

Both `Homework` and `Exam` questions can be regraded. However, for now, questions with external graders cannot be regraded using this procedure.

## 2. Regrading an assessment

The procedure to regrade an assessment is:

1. First update the `infoAssessment.json` file with `"forceMaxPoints": true` as described below, and sync this to the live PrairieLearn server.

1. Go to the instructor page for the assessment and click the "Regrade all assessment instances" button at the top of the "Assessment instances" box, or use the "Action" menu to regrade a single assessment instance for just one student.

**The `forceMaxPoints` setting only affects assessment instances that are explicitly regraded.** Students who take the exam later are not affected by `forceMaxPoints` in any way.

Regrading an assessment instance while the student is still working on it will not have any negative effects, but it may be confusing to the student if they see their points suddenly change during an exam, for example.


## Setting `forceMaxPoints` for a question

To award some or all students maximum points for a question during a regrade, edit the [`infoAssessment.json`] file and set `"forceMaxPoints": true` for any broken questions. For example:

```json
"zones": [
    {
        "title": "Easy questions",
        "questions": [
            {"id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25], "forceMaxPoints": true},
            {"id": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
        ]
    },
    {
        "title": "Hard questions",
        "questions": [
            {"id": "hardQV1", "points": 10},
            {"id": "reallyHardQ", "points": [10, 10, 10]},
            {
                "numberChoose": 1,
                "points": 10,
                "alternatives": [
                    {"id": "FirstAltQ"},
                    {"id": "SecondAltQ", "forceMaxPoints": true}
                ]
            }
        ]
    }
],
```

In the example above the questions `anEasyQ` and `SecondAltQ` will award maximum points to any student who has these questions and is regraded.


## Handling questions with alternatives

For questions that all students get on their assessment the above system is straightforward. For questions with alternatives it is less clear. For example, consider the case when `SecondAltQ` is broken in the assessment above. In the above example we only awarded maxinum points to those students who received `SecondAltQ`, while students with `FirstAltQ` did not receive automatic maximum points. However, it is probably a better idea to give maximum points to all students irrespective of which alternative they received, as follows:

```json
            {
                "numberChoose": 1,
                "points": 10,
                "forceMaxPoints": true,
                "alternatives": [
                    {"id": "FirstAltQ"},
                    {"id": "SecondAltQ"}
                ]
            }
```

For fairness, it is generally it is preferred to take the approach immediately above and award maximum points to all students, no matter which alternative question appeared on their particular assessment instance.


## Regrading a question

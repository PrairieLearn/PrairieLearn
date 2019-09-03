# Designing good assessments

This page gives opinionated advice about good practices when designing assessments. This is from the viewpoint of undergraduate U.S. university courses.

## Formative and summative assessments

It is convenient to separate assessments into two distinct types:

* **Formative assessments** are primarily designed for helping students to learn. We want to provide lots of opportunity to practice and re-practice, and we want to reward persistence so all students can eventually get full points. We are generally not concerned with cheating, because students who don't learn here will in any case fail the exams. For formative assessments we use `"type": "Homework"`. See the [Example Homework](#example-homework) below.

* **Summative assessments** are primarily designed to measure how much individual students know, and to motivate students to study before and after. We want to minimize opportunities for collaborative cheating, where students tell each other information about the assessment, so we will heavily use random question selection and parameterization. For summative assessments we use `"type": "Exam"`. See the [Example Exam](#example-exam) below.

## Managing cheating

We want to provide a supportive learning environment in the class, while also accurately assessing individual student knowledge to assign grades. This can be a difficult balance to strike. We recommend ignoring issues with cheating on formative assessments and designing them so all students can eventually get 100%, and focusing all cheating-prevention efforts on summative assessments.

To explain this to students, we recommend telling them:

> We aim to provide a supportive learning environment for every individual, while also making sure that we are being fair in how exams are run and course grades are determined. For this reason, we divide class activities into two categories:

> **Learning time** is when you should be focused on acquiring new knowledge and skills. This includes lectures, homeworks, and study time. During this time you can collaborate and get help as much as you want, and there is no such thing as "cheating". However, it is your responsibility to actually learn the material, not just copy answers to get the points, and success in the course exams will depend on you learning effectively.

> **Testing time** is when you need to perform as an individual. This is only during exams and quizzes. During this time you must not collaborate with anyone else or get any outside help. We will strictly enforce these rules out of fairness to all students.

This division into learning and testing times is student-friendly language for formative and summative assessments. Emphasizing "fairness" is a good way to explain these policies to students.

By removing cheating concerns from "learning time", we avoid ambiguities around statements like "you can work with friends on homework, but you must submit your own work". Students and instructors frequently have different understandings of what this means, leading to friction and lots of instructor effort. By emphasizing that it is the responsibility of students to learn effectively during "learning time", we also encourage the development of metacognition, as discussed below.

## Developing metacognition

FIXME

## Course grading scheme

Within a course, a recommended grading scheme is:

* Weekly formative assessments (homeworks, machine problems): 30% of total grade. Most students should get 100% on homeworks by persisting until they get full points.

* Within-course summative assessments (quizzes, midterm exams): 40% of total grade. Median scores should be around 80%.

* End-of-course final exam: 30% of total grade. The median score should be around 80%.

We recommend using this with a traditional 10-point grading scale: 90-100: A, 80-90: B, 70-80: C, 60-70: D, 0-60: F. Using this scale, the above grading scheme will give a median total score around 85%, so about 2/3 of the class will get an A or B grade.

## Curving exam scores

While we should aim for a median exam score around 80%, it is sometimes difficult to achieve this when using new questions for which we haven't yet collected statistics.

If an exam has median score below about 70% then it is generally a good idea to curve it. A simple and robust curving method is:

```
if S0 <= M0:
    S1 = 100 - (100 - S0)*(100 - M1)/(100 - M0)
else:
    S1 = S0 + M1 - M0
```

The variables here are:

* `S0` is the old raw score for a student exam (in range 0 to 100).
* `S1` is the new curved score for the student (in range 0 to 100).
* `M0` is the median of the raw score distribution.
* `M1` is the new desired median of the curved scores. A good choice is `M1 = 80`, so half the students are in the A/B range.

![Score curving function](score_curving.svg)

The benefits of this simple curving rule are:

1. There is only one parameter to choose (`M1`, which we normally fix at 80) and it's simple to implement.
2. Every student's score is guaranteed to increase, but the ordering of students is strictly maintained.
3. All students below the median get the same score boost, and lower-scoring students always get at least as much boost as higher-scoring students.
4. A perfect score of 100 maps to 100.
5. Using the median makes the curing insensitive to outliers, and lets us easily control the proportion of the class in the A/B range.

## Example Homework

Below is an example of a formative assessment using `"type": "Homework"`. This is also in `"set": "Homework"`, in which it is `"number": "1"`, and so it will be displayed as `Homework 1: Vector algebra`.

There are four access rules for this homework, which mean:

* TAs get full access at any time with no restrictions. This allows them to see the homework before it is released to students.

* Students can only access the homework in `"mode": "Public"`, which means that it is not visible to them inside an exam environment like the CBTF.

* We always use times that are one second before or after midnight, to avoid any confusion about which day is which. It also means we can say "released on Monday" or "due on Wednesday" with no extra confusion about _when_ on these days.

* We use a declining `credit` scale, where the homework is worth full credit until the initial due date of Jan 28, then there is a 2-day "late period" when it's worth half credit.

* After the homework is due, we leave it accessible to students for zero credit, so they can continue to use the questions for exam study.



This homework has six questions, each of which can be repeated until `maxPoints` is reached. Because it is `"type": "Homework"`, all students will see all six questions, and they can attempt them without limit. All questions are worth the same number of points because there is no advantage in using a complex point distribution on Homeworks. Students have access to a formula sheet which is the same as the one they will see on the exam, allowing them to get used to it.

```json
{
    "uuid": "13c12b31-ca94-492a-bf69-a8f383cbc582",
    "type": "Homework",
    "title": "Vector algebra",
    "set": "Homework",
    "number": "1",
    "allowAccess": [
        {
            "role": "TA",
            "credit": 100
        },
        {
            "mode": "Public",
            "credit": 100,
            "startDate": "2019-01-18T00:00:01",
            "endDate": "2019-01-28T23:59:59"
        },
        {
            "mode": "Public",
            "credit": 50,
            "startDate": "2019-01-28T00:00:01",
            "endDate": "2019-01-30T23:59:59"
        },
        {
            "mode": "Public",
            "credit": 0,
            "startDate": "2019-01-30T00:00:01"
        }
    ],
    "zones": [
        {
            "title": "Fundamental questions",
            "questions": [
                {"id": "addVectors1",   "points": 1, "maxPoints": 5},
                {"id": "addVectors2",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct1",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct2",   "points": 1, "maxPoints": 5},
                {"id": "crossProduct1", "points": 1, "maxPoints": 5},
                {"id": "crossProduct2", "points": 1, "maxPoints": 5}
            ]
        },
        {
            "title": "Intermediate questions",
            "questions": [
                {"id": "addVectors1",   "points": 1, "maxPoints": 5},
                {"id": "addVectors2",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct1",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct2",   "points": 1, "maxPoints": 5},
                {"id": "crossProduct1", "points": 1, "maxPoints": 5},
                {"id": "crossProduct2", "points": 1, "maxPoints": 5}
            ]
        },
        {
            "title": "Advanced questions",
            "questions": [
                {"id": "addVectors1",   "points": 1, "maxPoints": 5},
                {"id": "addVectors2",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct1",   "points": 1, "maxPoints": 5},
                {"id": "dotProduct2",   "points": 1, "maxPoints": 5},
                {"id": "crossProduct1", "points": 1, "maxPoints": 5},
                {"id": "crossProduct2", "points": 1, "maxPoints": 5}
            ]
        }
    ],
    "text": "For this homework you can use the <a target=\"_blank\" href=\"<%= clientFilesCourse %>/formulas.pdf\">formula sheet</a>."
}
```

## Example summative "Exam" assessment

Below is an example of "Exam 1" on the same topic as "Homework 1" above. The access rules always allow TAs access, and allow students access for full credit in the CBTF with a link to the given `examUuid`.

The question list for exams is more complicated than for homeworks because we want to randomize question selection. Each student taking this exam will get four questions, organized into two zones ("Fundamental questions" and "Advanced questions"). These zones are configured so that students get two easier questions first, and then two harder questions, which helps build student confidence. The points are set so that **the easier questions are worth more points than the harder questions**. This way most students will be able to get at least 20/30 = 66% by doing the easier questions, so the class exam scores will be roughly between 60% and 100%, as students typically expect. The harder questions serve as the differentiators between the 60%-students and the 100%-students.

The first question slot gives each student either `addVectors1` or `addVectors2`. These questions were both on "Homework1" so students should fine them very easy. There is no need to have more than two question alternatives in this slot, because the students will have seen both of them on the homework in any case.

The second question slot gives students one of `addVectors3`, `addVectors4`, or `addVectors5`. These are questions that the students haven't seen before, so we select from three question alternatives to minimize the risk of information transfer between students. Data shows that three or four question alternatives are normally sufficient ([Chen et al., 2018](http://lagrange.mechse.illinois.edu/pubs/ChWeZi2018a/)).

The third and fourth questions test concepts that the students practiced on "Homework 1", but using different questions that were not on the homework. For this reason we again provide three question alternatives for each slot.

```json
{
    "uuid": "424f3380-8e6d-42a2-8e72-f3c479f2711b",
    "type": "Exam",
    "title": "Vector algebra",
    "set": "Exam",
    "number": "1",
    "allowAccess": [
        {
            "role": "TA",
            "credit": 100
        },
        {
            "mode": "Exam",
            "credit": 100,
            "examUuid": "fa5e28c2-6733-47b7-a73f-5b58a21c8fb3",
       }
    ],
    "zones": [
        {
            "title": "Fundamental questions",
            "questions": [
                {
                    "numberChoose": 1,
                    "points": [10, 9, 8, 7, 6],
                    "alternatives": [
                        {"id": "addVectors1"},
                        {"id": "addVectors2"}
                    ]
                },
                {
                    "numberChoose": 1,
                    "points": [10, 9, 8, 7, 6],
                    "alternatives": [
                        {"id": "addVectors3"},
                        {"id": "addVectors4"},
                        {"id": "addVectors5"}
                    ]
                }
            ]
        }
        {
            "title": "Advanced questions",
            "questions": [
                {
                    "numberChoose": 1,
                    "points": [5, 4, 4, 3, 3],
                    "alternatives": [
                        {"id": "dotProduct3"},
                        {"id": "dotProduct4"},
                        {"id": "dotProduct5"}
                    ]
                },
                {
                    "numberChoose": 1,
                    "points": [5, 4, 4, 3, 3],
                    "alternatives": [
                        {"id": "crossProduct3"},
                        {"id": "crossProduct4"},
                        {"id": "crossProduct5"}
                   ]
                }
            ]
        }
    },
    "text": "For this quiz you can use the <a target=\"_blank\" href=\"<%= clientFilesCourse %>/formulas.pdf\">formula sheet</a>."
}
```

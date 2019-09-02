# Assessment design

## Example Homework assessment

Below is an example of "Homework 1". The access rules make it always visible by TAs, and it is visible to students for full credit for 11 days (the 18th to 28th inclusive), and then is available to view and practice but for zero credit thereafter. This homework has six questions, each of which can be repeated until `maxPoints` is reached. Because it is `"type": "Homework"`, all students will see all six questions, and they can attempt them without limit. All questions are worth the same number of points because there is no advantage in using a complex point distribution on Homeworks. Students have access to a formula sheet which is the same as the one they will see on the exam, allowing them to get used to it.

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
            "credit": 0,
            "startDate": "2019-01-28T23:59:59"
        }
    ],
    "zones": [
        {
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

## Example Exam assessment

Below is an example of "Quiz 1" on the same topic as "Homework 1" above. The access rules always allow TAs access, and allow students access for full credit in the CBTF with a link to the given `examUuid`.

The question list for exams is more complicated than for homeworks because we want to randomize question selection. Each student taking this exam will get four questions, organized into two zones ("Fundamental questions" and "Advanced questions"). These zones are configured so that students get two easier questions first, and then two harder questions, which helps build student confidence. The points are set so that **the easier questions are worth more points than the harder questions**. This way most students will be able to get at least 20/30 = 66% by doing the easier questions, so the class exam scores will be roughly between 60% and 100%, as students typically expect. The harder questions serve as the differentiators between the 60%-students and the 100%-students.

The first question slot gives each student either `addVectors1` or `addVectors2`. These questions were both on "Homework1" so students should fine them very easy. There is no need to have more than two question alternatives in this slot, because the students will have seen both of them on the homework in any case.

The second question slot gives students one of `addVectors3`, `addVectors4`, or `addVectors5`. These are questions that the students haven't seen before, so we select from three question alternatives to minimize the risk of information transfer between students. Data shows that three or four question alternatives are normally sufficient ([Chen et al., 2018](http://lagrange.mechse.illinois.edu/pubs/ChWeZi2018a/)).

The third and fourth questions test concepts that the students practiced on "Homework 1", but using different questions that were not on the homework. For this reason we again provide three question alternatives for each slot.

```json
{
    "uuid": "424f3380-8e6d-42a2-8e72-f3c479f2711b",
    "type": "Exam",
    "title": "Vector algebra",
    "set": "Quiz",
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

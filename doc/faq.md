# FAQ (Frequently Asked Questions)

Have a question or issue that wasn't listed here but you think it should be? 

Consider **[adding the question or issue](https://github.com/PrairieLearn/PrairieLearn/edit/master/doc/faq.md)** to the FAQ.

## How do I give a student access to homeworks or an exam after the semester is over?

You need to give the student access to both the course instance itself for the completed semester as well as the specific assessments within that course instance.

For example, suppose Fall 2017 is the completed semester and it is now Spring 2018. We have one student (`netid@illinois.edu`) that needs to take the final exam from Fall 2017 in February 2018. We will extend the Fall 2017 course instance and final exam access to include February 2018, but only for `netid@illinois.edu`.

First, edit `pl-exp101/courseInstance/Fa17/infoCourseInstance.json` to add a section for `netid@illinois.edu`:
```
    "allowAccess": [
        {
            "startDate": "2017-08-19T00:00:01",
            "endDate": "2017-12-31T23:59:59"
        },
        {
            "uids": ["netid@illinois.edu"],
            "startDate": "2018-02-01T00:00:01",
            "endDate": "2018-02-28T23:59:59"
        }
    ]
```

Second, edit the assessment `pl-exp101/courseInstance/Fa17/assessments/final/infoAssessment.json` to add a section for `netid@illinois.edu`:
```
    "allowAccess": [
        {
            "mode": "Exam",
            "credit": 100,
            "startDate": "2017-12-14T00:00:01",
            "endDate": "2017-12-22T22:10:59"
        },
        {
            "uids": ["netid@illinois.edu"],
            "mode": "Exam",
            "credit": 100,
            "startDate": "2018-02-01T00:00:01",
            "endDate": "2018-02-28T23:59:59"
        }
    ]
```

See [Access control](accessControl.md) for more details.

## Why is my QID invalid?

QID stands for the **Q**uestion **Id**entifier given to the folder that contains
the question information -- e.g. `info.json`, `question.html`, and `server.py` 
(optional) -- in `questions/`. QIDs can be invalid if they are spelled incorrectly
or simply are not present in the directory. On sync, these issues are picked up
and displayed as an error.

```bash
Error: invalid QID: "question_name"
```

To resolve this issue, first check the name of the folder inside of `questions/`
and, then, check the question name listed in `infoAssessments.json`. Either
rename the folder or change the name listed in assessments to be the same.

See [Directory Structure](question.md#directory-structure) for more details.

## Why do I have a Syntax Error in my JSON file?

During the sync process, all `.json` files are validated. If any syntax issues
arise, then an error message will be triggered. 

The most common error is there is a missing a comma after the prior entry
in a `infoAssessment.json` file. As a result, an unexpect token would be found.

```bash
Error: Error in JSON file format: file.json (line 55, column 17)

SyntaxError: Unexpected token '{' at 55:17
                {"id": "question_name", "points": [2, 1]},
```
				
For example, this error would be triggered under:

```json
"zones": [
    {
        "title": "Easy questions",
        "questions": [
            {"id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25]},
            {"id": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
        ]
    },
    {
        "title": "Hard questions",
        "questions": [
            {"id": "hardQV1", "points": 10}     # <----- No comma, but another question
            {"id": "question_name", "points": [2, 1]},
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

See [Question Specification](assessment.md#question-specification) for more details.

## Why is the UUID used in multiple questions?

While writing PrairieLearn questions, it is very common to copy an existing
question and slightly modify for new purposes. Often times, we forget to update
the `uuid` that is in the `info.json` file associated with a `v3` question.
As a result, we'll end up receiving a duplication error when we try to sync
the question base to the website.

```bash
Error message: Error: UUID 7a323f4c-cafd-40b2-8576-7db18e3f439b is used in
multiple questions: question_name_uuid_original, question_name_uuid_duplicate
```

Generating a new UUID via <https://www.uuidgenerator.net/> and substituting it 
in new question's `info.json` will resolve this issue. That said, care must be
taken to avoid changing the existing question's UUID that the new question was
derived from. Modifying the UUID for an existing question being used by students
will create a new variant of the question.

See [UUIDs in JSON files](uuid.md) for more details.

## Why can't I launch PrairieLearn with docker?

When previewing content within a local copy of PrairieLearn, the web version
is powered by a docker container. At the end of a session, closing out of
either the web browser or the terminal that launched the docker container
will **not** stop PrairieLearn from running. Therefore, when relaunching the 
docker version of PrairieLearn, the existing port my already be taken.
For example, we would have:

```bash
docker: Error response from daemon: driver failed programming external connectivity on endpoint pedantic_mayer (cf92f23baa5c5fffc37c8d83990b2a3597143a2d4d518c9e62e3231d7521ceef): Bind for 0.0.0.0:3000 failed: port is already allocated.
```

To address this, there are a variety of different ways. In particular, we have:

- Restart docker 
    - Click the Whale icon in the taskbar and select "Restart".
- Restart your computer.
- Stop the process in terminal with <kbd>CNTRL</kbd> + <kbd>C</kbd> and, then, 
  close the terminal application.   


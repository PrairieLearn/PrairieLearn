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

## Why does a user have the role of None?

Users with a role of `None` at one point added the course and later removed themselves.
All data for anyone who ever did anything in the course
-- even if they drop the course -- will be retained but with this indication.
Their information is also included within the aggregation of assessment
statistics.

## Why is the exam closed if it is not past the end date?

As a built-in security measure, assessments are automatically closed after 6 hours
of inactivity by the student. Once an assessment is closed, the student is
unable to provide new submissions. This is regardless of whether the end date
specified in an access control is reached. If the examination is a take-home exam,
then the feature can be disabled by specifying in the `infoAsssement.json`:

```
"autoClose": false
```

See [Auto-closing Exam assessments](assessment.md#auto-closing-exam-assessments)
for more details.

## How can we provide a cheat sheet for CBTF exams?

To make a cheatsheet available to students, place the cheatsheet inside of either:

- `clientFilesCourse` folder
    - Good if the cheatsheet will be used on other exams.
    - Located where the `infoCourse.json` file is.
- `clientFilesAssessment` folder
    - Useful if the cheatsheet should only be available for that specific assessment.
    - Located where the `infoAssessment.json` file can be found.

Next, within the `infoAssessment.json` for the exam, add the `text` entry with
the following:

For cheatsheets in `clientFilesCourse`, use:

```
"text": "The following forumula sheets are available to you on this exam:<ul><li><a href=\"<%= clientFilesCourse %>/formulas.pdf\">PDF version</a></li>"
```

Otherwise, for cheatsheets in `clientFilesAssessment`, use:

```
"text": "The following forumula sheets are available to you on this exam:<ul><li><a href=\"<%= clientFilesAssessment %>/formulas.pdf\">PDF version</a></li>"
```

To learn more about where files are stored, please see 
[clientFiles and serverFiles](https://prairielearn.readthedocs.io/en/latest/clientServerFiles/). 
For an implementation, please see 
[Exam 1](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInstances/Sp15/assessments/exam1/infoAssessment.json#L34) 
in the example course.

## How can I reference material in `serverFilesQuestion` and `clientFilesQuestion` from the `server.py`?

To reference a question in the `clientFilesQuestion` folder from `server.py`,
use the relative path from the base of the question.

```
./clientFilesQuestion/<your_file_here>
```

The same pattern holds for referencing material in a `serverFilesQuestion`.

To learn more about where files are stored, please see 
[clientFiles and serverFiles](https://prairielearn.readthedocs.io/en/latest/clientServerFiles/). 

## How can questions be manually graded?

Manually graded questions should be used with care. Note that any question
that has a manual grade component will disable automatic grading for any
PrairieLearn elements included in the page. With this being said, the
manual grading procedure requires:

- Adding to the question's `info.json` file:

```
"singleVariant": true,
"gradingMethod": "Manual"
```

- Download the "best" question files from underneath the assessment's "Downloads" page.
- Grade the files manually and record the results either as a percentage out of
  100 or as a pure point total using the appropriate PrairieLearn file format.
- Upload the grades back into PrairieLearn in the "Uploads" page.

From there, the grades are incorporated into the courses' gradebook and will
be available for export as part of the total assessment.

For a sample implementation of a manually graded question, please see the [`fibonacciUploadManual` question's `info.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/fibonacciUploadManual/info.json#L8) in the example course.

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

## How can I use a dollar sign ($) without triggering math mode?

Dollar signs by default denote either **inline** (`$ x $`) or **display mode** (`$$ x $$`) environments.

To escape either math environment, consider using PrairieLearn's markdown tag and inline code syntax.

```html
<markdown>
What happens if we use a `$` to reference the spreadsheet cell location `$A$1`?  
</markdown> 
```

In scenarios that do not make sense for using the code environment, consider disabling math entirely by
adding the `tex2jax_ignore` class to an HTML element.

```html
<div class="tex2jax_ignore">
Mary has $5 to spend. If each apple costs $2 dollars and a banana costs $1 dollar, then how many pieces of fruit 
can Mary get?
</div>
```

See [Using Markdown in questions](question.md#using-markdown-in-questions) for more details on
how `markdown` is implemented in PrairieLearn.

## What steps do I have to take to access the parameter object in an external grader?

By default, the external grader will receive a JSON dump of all values inside of the `data` object called
 `data.json`. This file is located at:

```sh
/grader/data/data.json
```

To access the JSON data, read in the file within the testing framework.

See [The Grading Process section in Externally graded questions](externalGrading.md#the-grading-process) for more details on the default external grader file system.

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

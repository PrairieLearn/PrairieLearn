# FAQ (Frequently Asked Questions)

Have a question or issue that wasn't listed here, but you think it should be?

Consider **[adding the question or issue](https://github.com/PrairieLearn/PrairieLearn/edit/master/docs/faq.md)** to the FAQ.

## How do I let a student continue working on an exam or take the exam again?

There are three different ways to let a student re-attempt or continue an exam:

1. **Continue working on the same copy of the exam:** Two things are needed: (1) Make sure the assessment is "Open" by going to the "Students" tab. If the exam is "Closed" then use the "Action" menu to re-open it. (2) Make sure the student has access to the exam. This is automatic if they are using a PrairieTest session and have a new reservation, otherwise they will need a custom [access rule](assessment/accessControl.md) with their UID.

2. **Start a new randomized version of the exam:** Two things are needed: (1) Delete the student's existing copy of the exam using the "Action" menu on the "Students" tab. (2) Make sure the student has access to the exam. If they are using PrairieTest they need to sign up for a new reservation, or outside a PrairieTest environment they will need a custom [access rule](assessment/accessControl.md) with their UID.

3. **Make a custom retry exam with a different selection of questions on it:** This is normally used if many students are going to take a second-chance exam. You can copy the original exam to a new assessment in PrairieLearn (use the "Copy" button on the "Settings" tab for the assessment) and adjust the question selection and access controls as appropriate.

## How do I give students access to view their exams after they are over?

To allow students to see their entire exam after it is over, you can add an [access rule](assessment/accessControl.md) like this:

```json title="infoAssessment.json"
{
  "allowAccess": [
    {
      "startDate": "2015-01-19T00:00:01",
      "active": false
    }
  ]
}
```

Students who took the exam will then have public access to their exams after the `startDate` until the end of the course instance, while students who did not take the exam will not be able to view it. Students will not be able to answer questions for further credit (due to `"active": false`), but they will be able to see the entire exam in exactly the same state as when they were doing the exam originally. Because students have public access to the exam, it should be assumed that all the questions will be posted to websites such as Chegg and Course Hero. To let students see their exams with some additional security, consider only allowing [limited access post-exam under controlled conditions](faq.md#should-students-be-able-to-review-their-exams-after-they-are-over) (although this requires in-person access by students and doesn't work online).

Note that when granting access via `"active": false`, students can still access and modify files in any [workspaces](workspaces/index.md) associated with questions on the assessment. However, they will not be able to submit any changed workspace files for grading.

## How can question pool development be managed over semesters?

Writing and maintaining a large pool of questions is a lot of work. There are many strategies for managing this process. The approach taken by the TAM 2XX courses (Introductory Mechanics sequence) at Illinois is:

1. Homework questions are always re-used semester-to-semester. It is assumed that solutions to these will be posted by students on the internet, so they are strictly for practice. Students do get credit for homeworks, but it assumed that any student who puts in the effort will get 100%.
2. Some questions in the pool are [tagged](question/overview.md#metadata-infojson) as "secret". These questions are only used on exams. Exams consist of a few homework questions, as well as secret questions on that topic. Secret questions are re-used for multiple semesters. Exams are only administered until highly secure conditions in a testing center or similar environment.
3. Every semester a small number of secret questions are written, and some older secret questions are moved to homeworks. This keeps the secret pool reasonably fresh and grows the homework pool over time. It also ensures that homework and exam questions are truly comparable in topics and difficulty.
4. For homeworks, the [`maxPoints`](assessment/configuration.md#question-specification) option is used so that students don't need to complete all homework questions to get 100% on the homework. This allows the homework to be quite long, and to be partially for credit and partially as a set of extra questions that students can practice.
5. Homeworks can be accessed for 100% credit until the due date, for 80% credit for a week after that, and for 0% credit (but students can still practice the questions) for the rest of the semester.

As an exception to the above strategy, during the COVID-19 semesters all exams were given remotely under conditions that were not as secure as the in-person CBTF. For this reason, all secret questions used on these exams are considered to be immediately "burned" and moved to the homework pool.

## Should students be able to review their exams after they are over?

Different instructors have different opinions regarding post-exam student access to questions because of the tradeoffs involved. For example, post-exam review allows students to ensure their work is graded correctly and learn from their specific mistakes. On the other hand, releasing questions publicly generally means that new exams need to be written and validated every semester, which takes resources away from other course activities and can lead instructors to use fewer, higher-stakes exams and to avoid the use of strategies such as second-chance exams.

Three strategies that courses adopt in practice are:

1. No access post-exam. This allows exam questions to be re-used semester-to-semester, but is unpopular with students and hinders them from conducting a detailed post-exam analysis of the questions and their performance.
2. Complete open access post-exam. This is popular with students and easy to implement, but requires a large effort by instructors to write and test new exam questions every semester.
3. Limited access post-exam under controlled conditions. For example, the TAM 2XX courses (Introductory Mechanics sequence) at Illinois allow students to review their exams inside the secure [Computer-Based Testing Facility (CBTF)](https://cbtf.illinois.edu/) during exam review sessions with TAs. This is moderately popular with students ([Chang et al., 2020](https://doi.org/10.18260/1-2--34321)) and still allows exam questions to be reused. A modified form of this method is to have TAs review exams with students during office hours, on the TAs' computers. This is the approach that was used by the TAM 2XX courses prior to the CBTF-based review system.

Note that if exams are taken online, such as during the COVID-19 semesters, then we should assume that the questions are publicly available and so there is little reason not to have open access post-exam.

## How can I view student answers to all variants of a Homework question?

The PrairieLearn interface only shows the most recent `variant` (a particular randomized instance) of a question to students, along with any submissions to that specific variant.

Instructors can see all past variants for students by going to the "Log" table on the view of a student's assessment instance (go to an assessment, then "Students" tab, then "Details" for a student, the scroll down to "Log"). In the Log table there is a column called "Student question" that shows a numbered list of the student views of the question, like `S-1#1`, `S-1#2`, `S-1#3`, etc. These are the first, second, third variants of that question that the student was given. Clicking those numbered links will show the specific variants, along with student answers to them.

The raw history of student answers can also be accessed in the "Data" column of the Log table, from the "XXX_all_submissions.csv" file on the "Downloads" tab, and via the [PrairieLearn API](api.md).

## How do I give a student access to homeworks or an exam after the semester is over?

You need to give the student access to both the course instance itself for the completed semester and the specific assessments within that course instance.

For example, suppose Fall 2017 is the completed semester, and it is now Spring 2018. We have one student (`student@example.com`) that needs to take the final exam from Fall 2017 in February 2018. We will extend the Fall 2017 course instance and final exam access to include February 2018, but only for `student@example.com`.

First, for the course instance, create a extension for the student:

1. Go to the course instance's **Publishing** page (Admin → Publishing)
2. Click **Add extension** to create a new extension
3. Enter the student's UID and set the new end date to February 28th, 2018.
4. Save the extension

This will allow the student to access the course instance beyond the original end date.

Second, edit the assessment `pl-exp101/courseInstance/Fa17/assessments/final/infoAssessment.json` to add a section for `student@example.com`:

```json title="infoAssessment.json"
{
  "allowAccess": [
    {
      "mode": "Exam",
      "credit": 100,
      "startDate": "2017-12-14T00:00:01",
      "endDate": "2017-12-22T22:10:59"
    },
    {
      "uids": ["student@example.com"],
      "mode": "Exam",
      "credit": 100,
      "startDate": "2018-02-01T00:00:01",
      "endDate": "2018-02-28T23:59:59"
    }
  ]
}
```

See [Access control](assessment/accessControl.md) for more details.

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
then the feature can be disabled by specifying in the `infoAssessment.json`:

```json title="infoAssessment.json"
{
  "autoClose": false
}
```

See [Auto-closing Exam assessments](assessment/configuration.md#auto-closing-exam-assessments)
for more details.

## How can we provide a cheat sheet for exams held in a testing center?

To make a cheatsheet available to students, place the cheatsheet inside either:

- `clientFilesCourse` folder
  - Good if the cheatsheet will be used on other exams.
  - Located where the `infoCourse.json` file is.
- `clientFilesAssessment` folder
  - Useful if the cheatsheet should only be available for that specific assessment.
  - Located where the `infoAssessment.json` file can be found.

Next, within the `infoAssessment.json` for the exam, add the `text` entry with
the following:

For cheatsheets in `clientFilesCourse`, use:

```json title="infoAssessment.json"
{
  "text": "The following formula sheets are available to you on this exam:<ul><li><a href=\"<%= clientFilesCourse %>/formulas.pdf\">PDF version</a></li>"
}
```

Otherwise, for cheatsheets in `clientFilesAssessment`, use:

```json title="infoAssessment.json"
{
  "text": "The following formula sheets are available to you on this exam:<ul><li><a href=\"<%= clientFilesAssessment %>/formulas.pdf\">PDF version</a></li>"
}
```

To learn more about where files are stored, please see [clientFiles and serverFiles](clientServerFiles.md).

## How can I reference material in `clientFilesQuestion` from the `server.py`?

To reference a question in the `clientFilesQuestion` folder from `server.py`,
use the relative path from the base of the question.

```text
./clientFilesQuestion/<your_file_here>
```

The same pattern holds for referencing material in any subdirectory of the question directory.

To learn more about where files are stored, please see
[clientFiles and serverFiles](clientServerFiles.md).

## Why is my QID invalid?

QID stands for the **Q**uestion **Id**entifier given to the folder that contains
the question information -- e.g. `info.json`, `question.html`, and `server.py`
(optional) -- in `questions/`. QIDs can be invalid if they are spelled incorrectly
or simply are not present in the directory. On sync, these issues are picked up
and displayed as an error.

```bash
Error: invalid QID: "question_name"
```

To resolve this issue, first check the name of the folder inside `questions/`
and, then, check the question name listed in `infoAssessments.json`. Either
rename the folder or change the name listed in assessments to be the same.

See [Directory Structure](question/overview.md#directory-structure) for more details.

## Why do I have a Syntax Error in my JSON file?

During the sync process, all `.json` files are validated. If any syntax issues
arise, then an error message will be triggered.

The most common error is there is a missing a comma after the prior entry
in a `infoAssessment.json` file. As a result, an unexpected token would be found.

```bash
Error: Error in JSON file format: file.json (line 55, column 17)

SyntaxError: Unexpected token '{' at 55:17
                {"id": "question_name", "points": [2, 1]},
```

For example, this error would be triggered under:

```json title="infoAssessment.json"
{
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
            {"id": "hardQV1", "points": 10} // <----- No comma, but another question
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
}
```

See [Question Specification](assessment/configuration.md#question-specification) for more details.

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

## What steps do I have to take to access the parameter object in an external grader?

By default, the external grader will receive a JSON dump of all values inside the `data` object called
`data.json`. This file is located at:

```sh
/grader/data/data.json
```

To access the JSON data, read in the file within the testing framework.

See [The Grading Process section in Externally graded questions](externalGrading.md#the-grading-process) for more details on the default external grader file system.

## Why can't I launch PrairieLearn with docker?

When previewing content within a local copy of PrairieLearn, the web version
is powered by a Docker container. At the end of a session, closing out of
either the web browser or the terminal that launched the Docker container
will **not** stop PrairieLearn from running. Therefore, when relaunching the
Docker version of PrairieLearn, the existing port may already be taken.
For example, we would have:

```bash
docker: Error response from daemon: driver failed programming external connectivity on endpoint pedantic_mayer (cf92f23baa5c5fffc37c8d83990b2a3597143a2d4d518c9e62e3231d7521ceef): Bind for 0.0.0.0:3000 failed: port is already allocated.
```

To address this, there are a variety of different ways. In particular, we have:

- Restart docker
  - Click the Whale icon in the taskbar and select "Restart".
- Restart your computer.
- Stop the process in terminal with ++ctrl+c++ and, then,
  close the terminal application.

## Why do special characters like `<` and `>` break my question display?

The HTML specification disallows inserting special characters onto the page (i.e. `<`, `>`, `&`), and using these characters in your question, for example with inline code, may break rendering. To fix this, either escape the characters (`&lt;`, `&gt;`, `&amp;`, more with [this escaping tool](https://www.freeformatter.com/html-entities.html)), or load code snippets from external files into `pl-code` with `source-file-name` attribute. For more information, see the [`pl-code` element documentation](elements/pl-code.md). Additionally, you may use the `<markdown>` tag which will correctly escape any special characters.

## Why can't I connect to PrairieLearn with Docker Toolbox?

Docker Toolbox is no longer supported. [Docker Community Edition](https://www.docker.com/community-edition) is required to [run PrairieLearn locally](installing.md).

## How can I make a block that can be re-used in many questions?

If you have a block of text that you want to re-use in many questions, possibly with a few parameters substituted into it, you can use the [`<pl-template>` element](./elements/pl-template.md). This element allows you to define a template in one place and then use it in many questions.

!!! danger

    Elements that accept and/or grade student input used within this element will not work correctly with `<pl-template>`. Templates should only contain other decorative elements.

## How can I hide the correct answer when students see their grading results?

Questions can specify the `showCorrectAnswer: false` property in `info.json` to hide the correct answer box entirely. For more information on this option, see [the documentation for question info.json files](question/overview.md#metadata-infojson).

For more granular control, some elements in PL have their own options for specifying whether to hide individual correct answers (for example, `pl-checkbox` has a `hide-answer-panel` attribute). Not all element types offer this as an attribute (e.g., `pl-multiple-choice` currently does not). However, to hide the correct answer for any kind of element, you can surround the particular graded pl-element with `pl-hide-in-panel` in the `question.html` file.

For example:

```xml
<pl-hide-in-panel answer="true">
  <pl-multiple-choice ...></pl-multiple-choice>
</pl-hide-in-panel>
```

For more information on this granular technique, see [the documentation for pl-hide-in-panel](elements/pl-hide-in-panel.md).

## I forgot to set `"credit":100` and now my students all have 0%. How do I fix this?

PrairieLearn access rules default to zero-credit so leaving off the credit means that students will accumulate points, but their percentage score will stay at 0%. To correct this, you should add `"credit":100` to [the appropriate access rule](assessment/accessControl.md#credit). The next time that a student answers a question their percentage score will be recalculated to be the correct value (as if they'd had full credit all along).

To fix student scores without requiring them to answer another question you can:

1. Download the `<Assessment-Name>_instances.csv` file from the "Downloads" tab.
2. Edit the `"Score (%)"` column to reflect the new percentage scores. This would normally be "Points / Max points \* 100".
3. Rename the `"Score (%)"` column to `"score_perc"` and delete all columns except `"uid"`, `"instance"`, and `"score_perc"`.
4. Upload the new scores with the "Upload new total scores" button on the "Uploads" tab.

Changing total scores via CSV download/upload should only be done after the assessment is over and students are not working on it anymore, to avoid any risk of overwriting scores while students are answering more questions.

## I updated my question, but students are still seeing the old version. How can I get students to see the new version?

Some changes in question files do not take effect for students that have already started working on a variant. These include, but are not limited to: changes in the value of correct answers, added or removed graded elements, changes in element type (e.g., replacing string input with integer input), changes in the `answers-name` option for graded elements, some other changes in element settings (e.g., multiple choice answers), changes in file names for gradable files, or updates to the `generate` function in `server.py`.

You are highly encouraged to avoid changes such as the ones above to questions where students have already started working through the question. However, if such a change is necessary, and you expect students to have their variants reset after such a change, you may do so in one of two ways:

- To reset all variants for a particular assessment question, go to the assessment page, click "Actions" on the relevant question, then "Reset question variants". This will invalidate _every_ variant that has been created so far and that has not yet been completed, and students will be given a new one the next time they load the question.

- To reset the variants for an individual student (or a small subset of students), go to the assessment page, select the "Students" tab, click on the assessment for the individual student (or group, for group assessments), then on the Questions list click "Action" on the relevant question, then "Reset question variants". This will invalidate the variants only for the specific student or group.

Neither of these options will affect the score a student may already have obtained in any previous variants. However, any work a student may have started on an open variant but not yet submitted will be lost.

For exams and other summative assessments where students may have been negatively impacted by such a change, you are encouraged to consider [giving students credit for issues such as these](assessment/regrading.md).

## When I open some CSV downloads, some data is in the wrong columns

When loading some assessment download files, such as `*_all_submissions.csv`, in Excel, you may notice data appearing in the wrong column or wrapping incorrectly. This typically happens because Excel has a maximum cell size of 32,767 characters and does not always correctly parse complex CSV data, particularly when fields contain JSON or special characters. While the `Params` column is the most likely culprit, other columns such as true answers, submitted answers, or feedback may also be affected. To work with these files, you can use Pandas in Python to clean or restructure the data for easier processing in Excel. For example:

```python
import pandas as pd
df = pd.read_csv("PREFIX_all_submissions.csv")

# Strip the JSON Params data and save to a new CSV
df2 = df.drop(columns=["Params"])
df2.to_csv("PREFIX_all_submissions_no_params.csv", index=False)

# Write all the data (including Params) to an Excel file,
# while trimming the values in Params that are above the Excel limit
df.to_excel("PREFIX_all_submissions.xlsx", index=False)
```

## I have files that should be included both in the workspace and in the tests. How do I store these files to avoid duplication?

In these cases, you can store your files in the `tests` directory for the question and reference them from the workspace by adding them to the `_workspace_files` list. For example, suppose we want to include `xyz.c` and `xyz.h` in both the workspace home folder, and in `/grade/tests` in the autograder. To do this, save these files to `[QUESTION DIRECTORY]/tests`, and in `server.py`, include the following lines:

```python
def generate(data):
    data["params"]["_workspace_files"] = [
        {"name": "xyz.h", "questionFile": "tests/xyz.h"},
        {"name": "xyz.c", "questionFile": "tests/xyz.c"},
    ]
```

## When uploading grades via CSV, the upload process cannot match some group names. Why?

The [manual grading documentation](./manualGrading/index.md#manual-grading-using-file-uploads) lists a process for manual grading using CSV files, that involves downloading a CSV file, changing the score/feedback in the file locally (via Excel or other tools), then uploading the changed file. However, when a group assessment includes group names comprised of numeric values with leading zeros or strings that can be interpreted as dates, Excel may change the group name to match its own representation of these values (e.g., by removing leading zeros). This causes the upload process to fail to recognize the group name.

There are a few possible ways to address these cases:

- Instead of opening the CSV file directly on Excel, you can import it to a blank new workbook, ensuring the group name column uses the "Text" data type. More details can be found in [the Microsoft Support page](https://support.microsoft.com/en-us/office/keeping-leading-zeros-and-large-numbers-1bf7b935-36e1-4985-842f-5dfa51f85fe7).

- If the number of groups with this issue is relatively small, you can manually edit the CSV file to update the group name to the proper name. Note that you need to ensure Excel interprets the name you input as a string. One way to ensure this is to [add an apostrophe in front of the group name](https://support.microsoft.com/en-us/office/stop-automatically-changing-numbers-to-dates-452bd2db-cc96-47d1-81e4-72cec11c4ed8) when setting it on Excel, e.g., `'0123`.

- Alternatively, you can remove the `group_name` column altogether. While the column is used to match a row to a specific submission, if the column is not found, the row can be identified with other columns such as the `submission_id`.

One way to avoid this problem is to remove the ability for students to specify their own group names. This can be done by [setting `"studentGroupChooseName": false`](./assessment/configuration.md#enabling-group-work-for-collaborative-assessments) in the assessment configuration. When this option is set, all student-created groups are named with a default pattern of `groupXXX`, where `XXX` is an integer number. This pattern does not typically cause issues with spreadsheet applications.

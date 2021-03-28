# Regrading

# Summary

Provide instructors with the options of regrading a question for a perticular student or whole class.

# Motivation

Sometime the internal/external grader for a question in homework or exam might not be set up correctly before the question is released to the student. Currently, if an instructor realize there was an issue with the grader of a question, the options the instructor got is very limited according to this [doc](../docs/regrading.md). We hope to give the instructor a wider range of options to resolve a broken question.

Goals:
* Instructor can go to the assessment instantce page to regrade a question for a particular student.
* Instructor can go to the assessment questions page to regrade a question for the whole class.
* The regrading job should take all the user submissions and rerun grader on all of them in the order as they come in to calculate the new score.
* The instructor can choose between whether to replace the old score with a lower new score or not. 

# Proposed solution

## Backend

### Overview
We can modify the current [regrading](../lib/regrading.js) system and add the option to rerun the internal/external grader. The code in the backend that runs the grader can be found in [question.js](../lib/question.js). We can also add a new method in this file to handle the regrade functionality.

### Workflow (for regrading a question for one student)
1.  Get all the submissions and variants of a student of a question
2.  Rerun the grader and get the new score (and stop early if the score reach 100%)

## Frontend
We want to provide more flexibilities to the instructors by allowing them to regrade a question for a single student and whole class. However, since we already had the "Regrading" tab in instructor assessment page, there is more than one way to update the UI.
* Regrade a question for whole class
    *   We could keep the "Regrading" tab and remake the regrading page by adding a new section that contains a list of every questions in this assessment (pretty much like the assessment questions page). And the instructor can choose to regrade a question for the whole class using a button.
    *   We could remove the "Regrading" tab and add the option to regrade at assessment questions page by adding a new column that trigger the regrade options.
* Regrade a question for a student (remove the "Regrade" option from "Action" menu in assessment instance page)
    *   In the assessment_instance, add a new column to "Questions" table that contains a regrade button.
    *   Move it to the "Regrading" page by adding a new section.

# Doubts
1.  Multi-variant question vs. Single-variant infinite retries question
2.  Coding homework question with a large number of submissions

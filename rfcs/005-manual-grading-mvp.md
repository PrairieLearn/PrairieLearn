# PrairieLearn: Manual Grading

## Quick Links

- [Project Board](https://github.com/PrairieLearn/PrairieLearn/projects/9)
- [Overview/Motivation](##Motivation)
- [MVP Goals & SPIKE Links](###Core-Goals-and-Objectives)
- [Stretch Goals](###Stretch-Goals-and-Objectives)

## Motivation

### Overview

As is, PrairieLearn is well suited for automated grading, as it is highly customizable and adaptable. However, manually updating grades--even through the scores upload interface--is tedious and difficult, and there’s no way to update the scores in various parts of questions. As there are many non-technical users, and many questions are complex and have multiple parts, we propose augmenting PraireLearn by adding a manual grading feature.

When developing manual grading, features should integrate with PraireLearn’s existing grading architecture--autograders should still run if possible, the grade function should still run, ect.

### Sample Use Cases

- Provide feedback for and help easily grade elements that are difficult to autograde (i.e. longform text responses, file uploads).
- Trigger a manual grading workflow for a certain question part if an autograder fails.
- Grant instructors the option to regrade parts of an autograded question for style points.
- Allow easy, granular, and descriptive manual grading via CSV upload.
- Retrigger grading workflows after updating a question’s grade function.

## Goals and Objectives

### Core Goals and Objectives

#### **A way to mark questions for “manual grading”**

- To create an extensible manual grading feature which can be applied to _all_ elements, including file upload and custom elements, PraireLearn needs a generic way to mark a question for manual grading.
  - We can achieve this through a wrapping element or through a “manual=true” flag on elements. The latter encourages developing element inheritance, and implicitly attaching scores, argument values, ect. to any element with the “manual=true” flag.
- In order to clearly communicate with students, we need a way to inform them that question grades can still change after the autograder grants a preliminary score.
  - PrairieLearn has multiple question states already, which were initially tied into the "pending autograde"/"in autograde"/"graded" workflow. For consistency, we should look at appropriating this.
- To take advantage of autograders, we should be able to mark a question as “finished grading” if an autograder passes without issue, and mark it as “unfinished grading” if tests fail.

#### **A common regrade** **workflow**

- We have multiple use cases for “regrading” or “manual grading” within PraireLearn, so we need a common workflow to do so.
  - Many instructors wish to recalculate grades after adjusting the grade function, or making other alterations to the question.
  - When uploading scores in the CSV re-grading interface, it is useful to provide scores for particular parts of questions, so instructors do not have to try to recalculate question totals themselves.
  - With a manual grading interface, an instructor may want to update scores for a particular part of the question.
- To avoid race conditions of total score calculations v partial score calculations, we should introduce a secondary “grade” function, breaking up the grading into a “pre” part to compute partial scores, and a “post” part to calculate a final score.

  ```txt
  matt, 12:26 pm

  the pre/post grading was to allow us to separate out two grading stages:

  1. The "pre" part is designed to compute partial scores
  2. The "post" part is designed to sum up the partial scores to obtain the total scores.

  At the moment, these are both combined into a single grade() function. But if we seperate them then we can insert manual grading between these two stages
  ```

#### **A “manual grading” UI**

- In order to encourage use of a manual grading feature by non-technical users, we should develop a basic UI to allow instructors to interact with student assignments and manually grade them.
- The grading interface should, at a bare minimum, provide context for the question, display the “correct answer” for a partial score, and allow the user to change the partial score to some numeric value.
- The grading interface should allow instructors to attach comments to the entire question, which should be stored in the “feedback” field of the submission, similar to the manual grading upload.
- There should be a “parent manual grading UI”, which can help users coordinate manual grading across an assignment.
- In order to better coordinate grading, there should be a progress bar which indicates the number of manually graded questions left to grade from a student’s assignment, and the number of questions left across all submissions.

#### **An improved student UI**

- Students should be able to see the history of scores on a given manually graded question, so they can easily view the progression of scores on a question.
- Students should have easy access to feedback provided for an assignment.

### Stretch Goals and Objectives

#### **An enhanced grading UI**

- To take full advantage of PraireLearn, instructors should be able to choose different instances of a submission in the UI to manually regrade.
- Instructors should be able to provide feedback _per question part_ in order to give students more in depth feedback.
- The parent grading page should provide more statistics on TA grading, i.e. a revision history table, counts of questions graded by TAs, in order to give instructors feedback on their team.
- The grading UI should be mobile friendly.

#### **Rubrics for manually graded questions**

- To closely mirror other grading platforms, and to help instructors and students use a manual grading feature, users should be able to attach rubrics to manual grading questions in the HTML.
- If an UI exists for creating questions, there should be a menu to add rubrics to “manual grading” questions.

#### **Regrade Requests and Extensions to “Report Issue”**

- To increase completeness of the manual grading feature, students should be able to submit regrade requests through the report issue button.
- To increase communication with students, students should be able to see the state of reported issues/regrade requests, a’la JIRA ticket.

#### **Designated “partial credit” questions**

- To reward students for their work if they get a question wrong, instructors should be able to designate an area for scratch/other work, where they can earn partial credit.

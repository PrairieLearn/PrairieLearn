# RFC: Question Reset

## Summary

This RFC is to address the "Question Reset" feature mentioned in various places around the repo, with most references linked from #1041. 

## Background

### Previous Discussion

- "Allow instructors to invalidate any open variants of a question and force new ones" #1041

- "Need a button that makes it so if students log out and log back in again, they will get a new variant of any given question. This is important so that if an instructor changes the question, students don't continue working on variants of the original version." #756

- "Allow resetting of individual questions on tests" #233

- "Stuck in variant after error in student homework" #787

- "If a single-variant question has an error (e.g. an element is missing a required parameter), it will be flagged as broken, and the user will see "Broken question due to error in question code". Normally, you could fix the code and generate a new variant to proceed, but since the question is single-variant, you can't generate a new variant." #769

### Stakeholder needs

#### Instructors

- Should be able to reset for an entire class or an individual student
- 

#### Students

- Shouldn't lose credit for a reset question, when appropriate
- Running the grader on a reset question should still work, if the page was loaded before the question was reset
- Access shouldn't be revoked to a reset instance question. 
  - If they still have the URL, they can be met with an alert telling them that the question has been reset, their past attempts have been 

## Feature Description

On the instructor assessment interface, there should be an option to "hard-reset" a question. 

- For entire class: In the "questions" tab, let there be a button on each question's row labeled "Regenerate". When clicked, a dialog appears: "Regenerate question for every student? All current progress and submissions will be discarded. Only use if question is being fixed or replaced," followed by form A. 
- For particular student(s): In the

Layout of Form A:
- "Award credit for completed work"
  a) Full (100%)
  b) Partial (same as already awarded)
  c) None

Instructors should be given the option to keep partial, full, or no credit for students who previously attempted a question that's being reset. 

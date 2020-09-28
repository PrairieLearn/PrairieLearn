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

When a question with issues is published and already being used by students, instructors might need to invalidate past attempts and redirect students to a working question. This action would be done once per question, if the problem lies inside the question itself, or once per student, if the student encountered an issue with the question that doesn't invalidate other students' responses.

#### Students

Credit shouldn't be lost for a reset question, when appropriate. Access shouldn't be revoked to a reset instance question, so that students can access their own past responses.

## Feature

### Description

Instructors can "hard reset" a question for the entire class, or for an individual student. Choosing to do this invalidates the students' instance questions and automatically generates a new instance question in place of them. Students who haven't yet generated an instance of that question (i.e. if they haven't opened the assessment yet) shouldn't get a new instance question.

### Database changes 

("iq" is short for "instance question", and "aq" is short for "assessment question")

#### New table: `assessment_question_resets`
Fields:
- `id`: unique identifier.
- `assessment_question_id`: the ID of the aq that this reset applies to.
- `by`: the uid of the user who performed the reset.
- `at`: the time that the reset took place.
- `percentage_score_override`: `NULL` if instructor kept scores of previous attempts, `0` through `100` otherwise.

#### New table: `instance_question_resets`

- `iq`: unique identifier.
- `assessment_question_reset_id`: the ID of the reset that affected these iqs.
- `old_iq_id`: the ID of the iq that was replaced in the reset.
- `new_iq_id`: the ID of the iq that was generated in the reset. 

### User Interface

#### Instructors

Let there be a button labeled `Reset` that appears on the each row in the "questions" tab of an assessment, as well as in each question row under "details" in the "students" tab. When clicked, a dialog appears: 
- Title: `Reset question`
- Body: `This will hard reset this question for [all students / uid of student]. All current progress and submissions will be discarded. Designed for cases where a question is being fixed or replaced.`
- Credit radio select:
  - Label: `Award credit for previously completed work`
  - Options:
    - Default: `Partial (same as already awarded)`
    - `Custom amount [number input 0-100, default: 100]`
- Submit options:
  - `Regenerate`
  - `Cancel`

If a reset has happened, then in both areas where the Regenerate button can appear, there should be some indicator of this, with information about the time that it happened and which instructor did it. If multiple resets have happened, list them.
  
#### Students

On the assessment instance page, next to a question that's been reset, there will be a badge labeled "Reset". Focusing on it gives a popover that reads `This question has been reset by the instructor.`, followed by a link to the reset question and a description of the grading strategy used for their previous attempts:
> `Credit up to the highest score earned on previous attempts has been awarded. {percentage chosen by instructor}% credit was automatically given, but can still be increased by new attempts.` (exclude last part if percentage == 100)

On a reset instance question's page, there will be an alert containing the same info as the "Reset" popover on the assessment instance page, but with a link to the new question instead of the old one. Assessment navigation buttons ("previous"/"next") don't render in this case, since the instance question no longer exists inside the question order.

### Implementation

Any time that an instructor resets a question, create the relevant entries in `assessment_question_resets` and `instance_question_resets`.

When querying any instance question, do a left exclusive join on `instance_question_resets` to ignore reset questions. 

When a new instance question is generated, automatically set its score based on instructor input.

# PrairieLearn

PrairieLearn is an educational learning platform for authoring, delivering, and grading automated
assessments.

## Language

**Question**:
A problem or task authored in a course to assess a learner's understanding.

**Template question**:
A finalized **Question** intended to be copied as the starting point for another question.
_Avoid_: Draft template

**Draft question**:
A question under construction that is stored in the course but cannot be used in assessments until
it is finalized.
_Avoid_: AI draft, draft

**Draft namespace**:
The internal course-repository location where **Draft questions** are stored before finalization.
_Avoid_: Presenting it as a normal QID prefix in user-facing UI

**QID**:
The course-visible identifier for a finalized **Question**.
_Avoid_: Using the draft storage path as a user-facing QID

**Finalize**:
To turn a **Draft question** into a normal **Question** by assigning its final title and QID.
_Avoid_: Publish, save

**Questions table**:
The instructor-facing list of a course's finalized **Questions** and **Draft questions**.
_Avoid_: Drafts page

**Draft editor**:
The instructor-facing workspace for editing, previewing, and finalizing a **Draft question**.
_Avoid_: AI editor

## Relationships

- A **Course** contains zero or more **Questions**.
- A **Template question** is copied to create a new **Draft question**.
- A **Draft question** is a **Question** that has not been finalized.
- A **Draft question** is stored in the **Draft namespace** until it is finalized.
- The **Questions table** shows **Draft questions** by default.
- The **Draft editor** is available for all **Draft questions**; AI assistance is an optional
  feature within it.
- Draft state in the database is derived from the **Draft namespace** during sync, not an
  independently mutable domain state.
- **Draft questions** may have metadata for creator and creation/update time, but this metadata is
  optional because drafts can be synced or created outside the new creation flow.
- **Draft questions** can originate from the UI or from synced course files.
- An **Assessment** can use finalized **Questions** but cannot use **Draft questions**.
- A **Draft question** cannot be shared, publicly shared, source-shared, or copied into another
  course.
- Finalizing a **Draft question** makes it eligible for normal authoring workflows and assessment
  use, but does not publish it publicly or make it visible to students by itself.

## Example Dialogue

> **Dev:** "Should a **Draft question** appear in the Questions table?"
> **Domain expert:** "Yes, but it must stay clearly marked as a **Draft question** and unavailable
> for assessments until it is finalized."

## Flagged Ambiguities

- "AI draft" previously referred to draft questions created through AI question generation.
  Resolved: use **Draft question** for the domain concept, and use "AI draft" only when describing
  legacy UI or compatibility routes.

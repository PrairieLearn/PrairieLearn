---
name: diagnose-assessment-issues
description: Diagnose problems in a PrairieLearn assessment from past student results and the question source, such as alternatives that aren't comparable, questions that take far longer than intended, and grading that distorts scores. Use for requests such as "How did Quiz 4 go?", "Were the variants fair?", or "What should we fix in Quiz 6 before next term?" Reports recommended edits without making them.
---

# Diagnose assessment issues

When you're done, the instructor should know **which questions to change, how,
and why**, after about five minutes of reading. Every claim must hold up.

Statistics tell you where to look. The question source tells you why. A gap
between two numbers isn't a finding until you can point to what in the question,
grader, or assessment setup causes it, or say plainly that you couldn't.

## Boundaries

- **Read-only.** Don't edit course files. The skill ends with the report. If
  the instructor then asks for an edit, treat it as a new task. Grade changes
  stay with the instructor; point them to PrairieLearn's score tools.
- **Aggregate results only.** Never show user IDs or per-student rows, and
  never copy student identifiers from course files or attachments.
- **Ask only when blocked.** If you can't tell which course or assessment is
  meant, ask one question and recommend an answer. Otherwise make reasonable
  choices and state them in the report.

[references/data.md](references/data.md) covers which course data to download,
how to compute each measure, what the data can't show, and known quirks.

## Use PrairieLearn's terms

Use the terms instructors see in PrairieLearn and its documentation, and don't
invent labels:

- [Concepts](https://docs.prairielearn.com/concepts/): course, course instance,
  assessment, question, variant.
- [Assessment configuration](https://docs.prairielearn.com/assessment/configuration/):
  zones, question alternatives, `numberChoose`, `bestQuestions`, points lists,
  assessment instances.
- [Manual grading](https://docs.prairielearn.com/manualGrading/): rubrics and
  rubric items.

The docs call each entry in a zone's question list a _slot_. A slot with
alternatives gives each student one (or `numberChoose`) of them. Refer to a
question by its QID and by the number shown on the assessment's
**Questions** page, for example "question 6.2 (`OhareTrackComputeR`)".
Alternatives share the first number. Name course instances as PrairieLearn shows
them.

## 1. Establish scope

1. Identify the assessment, from the page the instructor is viewing when they
   don't name it. Look in the course for a design guide or earlier reports, and
   use any goals you find, such as intended time or difficulty.
2. Choose the offerings:
   - **The offering the instructor means.** Read relative terms like "last fall"
     as the most recent completed term with that name, and say so.
   - **The current definition.** Fixes apply here. Check whether it has already
     been given; missing data doesn't mean it hasn't run. If you can't tell, ask
     or state your assumption.
   - **Past offerings of the same assessment.** Focus on the most recent ones
     with the same questions, and use older ones to check whether a pattern is
     stable. Confirm they match by comparing questions, not just names. If
     several course instances match a term, such as another campus, use the one
     with data and say so.
   - **Other assessments in the same course,** for comparison only. They show
     whether a pattern is specific to this assessment, for example whether every
     quiz got longer.
3. Record each offering's structure. These all change how numbers should be read:
   - which questions compete for the same slot
   - points and retry schedules
   - "choose N of M" draws, best-N zones, and optional questions
   - manual or auto grading
   - retakes and separate versions
   - exam length, which may live outside PrairieLearn (for example, in PrairieTest)

## 2. Measure

For each question in each offering, compute:

- number assigned
- mean final score and share with full credit
- mean first-submission score
- mean attempts
- median time
- share with no submission

Show alternatives in the same slot side by side, with their sample sizes. Keep
offerings separate; pool them only when their definitions are identical. When
students get many attempts at full value, first-submission scores and attempt
counts mean little; use per-part results on the best submission instead.

Then add the evidence that a given candidate needs:

- **Time pressure:** the share of students finishing near the time limit.
  Medians hide this when most students run to the end.
- **Effect on students:** points out of the assessment total that students who
  drew an alternative lost or gained, compared with students who drew the other
  alternatives for that question. When the alternatives fall into two clear
  groups, compare the groups.

Course data has no answer contents, so it can't show which part of a question
students lose points on, which wrong answers are common, or whether some
generated parameters are harder. When a finding depends on one of these, name
the export that would settle it (see data.md).

## 3. Find candidates, then rule out other explanations

Candidates worth explaining:

- **Alternatives in one slot that differ** on score, full credit, time, attempts,
  or non-submission, especially when the gap repeats across offerings.
- **Similar scores that hide a workload difference.**
- **Questions far from the intended time or difficulty.** With no stated target,
  compare against the question the item replaced and other slots worth the same
  points.
- **Shifts between offerings,** for one question or the whole assessment.
- **Grading that differs** between alternatives.

Before you believe a candidate, rule out explanations that have nothing to do
with the question:

- **Small samples.**
- **Non-random assignment.** For example, a different alternative on different
  exam days. Check assignment by date. Without dates, compare each
  alternative's count with an even split.
- **Students choosing** which questions to attempt.
- **Stronger or weaker groups,** across terms or across exam days. Compare
  scores on questions that didn't change.
- **Score changes by staff,** including partial bumps, not only full credit.
- **Question edits between offerings.** Check the question's Git history.
- **Course-wide changes,** such as a new format added to every quiz.
- **Time measurements that include idle time.**

A gap that reverses between offerings, with no explanation, is weak evidence.
Report the pair as unstable rather than calling one variant harder.

## 4. Explain each candidate from the source

Read the alternatives side by side: prompt, generator, grader or tests, and
starter code. From what _these_ questions ask, decide which differences could
change difficulty or workload. Don't apply a fixed checklist; what matters depends
on the subject and question type. Frequent causes:

- more steps or outputs, or an extra method to apply
- less scaffolding, or examples that don't cover what the tests check
- test cases or parameter ranges that only one alternative has
- grading weights, all-or-nothing parts, or rubrics with different rules
- tolerances, units, sign conventions, or answer formats
- wording that is ambiguous, contradicts itself, or uses different terms from
  those taught
- generated parameters that produce harder or degenerate instances

Alternatives may differ on purpose, and a question may be hard on purpose. The
standard is **comparable difficulty and workload for everyone who could draw the
slot**, not identical questions. If a difference looks intentional, keep it, and
frame the problem as an unfair draw.

Test each explanation against the evidence from step 2. For example, if you
suspect an extra step, do students need more submissions or more time on that
alternative?

Label each finding's confidence:

- **Observed:** the data shows it directly.
- **Likely:** the source and data support a cause, but haven't proven it.
- **Predicted:** found in the source only, with no student data yet.
- **Unexplained:** the gap is real, but no cause was found.

Most causes will be Likely, because course data can't show where in a question
students went wrong. For Likely, Predicted and Unexplained findings, name the
data that would settle it. Add a few words when strength varies, for example:
"Likely; reversed in one term."

## 5. Recommend edits

Give each finding the smallest change that fixes the problem and keeps what the
instructor intended. It can be:

- a question file
- an assessment setting, for example moving a question to another slot or giving
  everyone the hard question
- a rubric in PrairieLearn
- a process step, such as calibrating graders

Say "No edit needed" or "Already fixed in the current definition" when that's
the honest answer. Don't recommend grade changes yourself. If a past offering
was clearly unequal, state the effect in points and leave the decision to the
instructor.

## Report

Give the report as your reply; don't add it to the course unless the instructor
asks for a file.

Make the report easy to scan. Use tables for numbers, and write
findings as ideas: what about the question causes the problem, in plain words.
Use measures a reader understands without explanation, such as mean score, share
with full credit, minutes, and points out of the total. Label table columns in
words ("points gained or lost, out of 100"), not symbols or abbreviations. If you
need anything less familiar, define it in one sentence where it first appears.

Use these sections, adapting them to the assessment:

```markdown
# <Assessment>: diagnosis

<course instances analyzed>

## Bottom line

<Up to five bullets, most important first: what to change and why.>

## Scope

<A table of the offerings analyzed: course instance, dates, number of students,
and anything that changes how to read them (structure changes, manual grading,
retakes). Then what was included and excluded, in a few bullets.>

## Results at a glance

<For the main offering analyzed, one table per zone, headed with the zone's
points. Give each slot a bold row: its number, what it tests, its points, and
its combined students, mean score, full credit and median minutes. Under it,
one row per alternative starting with "↳": what it asks (bold the part that
differs), its QID, and the same numbers, plus its mean minus the slot's mean.
Bold any alternative 10 or more points from its slot.>

## Findings

### <The idea, in a sentence: "6.5 needs the chain rule; 6.3 and 6.4 don't">

<A small table or two sentences of evidence, each number with its course
instance and n.>
**Why:** <cause in the source, with file path> (or "Unexplained: …")
**Confidence:** <label>
**Effect:** <points out of the assessment total, and for whom>
**Edit:** <concrete change, "No edit needed", or "Already fixed">

## Checked, no change needed

<One line each: alternatives that are well matched, gaps judged to be noise.>

## Questions for the instructor

<Only decisions you can't make. Omit the section if there are none.>

## Data and definitions

<The data each number is based on and the filters applied (for example, staff
attempts excluded), and a short table defining each measure used.>
```

The bottom line and summary tables should give the picture in a minute.
Keep each finding under about 150 words, and order findings by effect on
students: how many were affected and by how much. Most reports have three to six
findings. Merge related minor ones, and move small issues to "Checked, no change
needed".

## Before handing off

- Recompute the numbers each finding uses from the downloaded data, including
  ranges and claims like "in every offering".
- Confirm each finding cites a source or is marked Unexplained.
- Confirm the step 3 explanations were ruled out for each finding.
- Confirm the report contains no user IDs or per-student rows.
- Reread the bottom line: could the instructor act on it alone?

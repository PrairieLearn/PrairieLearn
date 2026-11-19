---
name: diagnose-assessment-issues
description: Diagnose problems in a PrairieLearn assessment from past student results and the question source, such as alternatives that aren't comparable, questions that take far longer than intended, and grading that distorts scores. Use for requests such as "How did Quiz 4 go?", "Were the variants fair?", or "What should we fix in Quiz 6 before next term?" Reports recommended edits without making them.
---

# Diagnose assessment issues

When you're done, the instructor should know **which questions to change, how,
and why**, after about two minutes of reading. Every claim must hold up.

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
question by the number shown on the assessment's **Questions** page and a few
words on what it asks, with its QID once, for example "question 6.2, the radius
of the track (`OhareTrackComputeR`)". After that the number is enough.
Alternatives share the first number. Instructors see question numbers, not
slots, so in the report write "question 4" and "its alternatives". Name course instances as PrairieLearn shows
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

Course data also has each submission's per-part scores, submitted answer, and
grader feedback, and each variant's generated parameters. When a finding depends
on which part of a question students lose points on, which wrong answers are
common, or whether some generated parameters are harder, download those columns
for the questions involved and check (see data.md).

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

A gap between alternatives is Observed, but its cause stays Likely until
per-part scores, submitted answers, or variant parameters show where students
went wrong. Check them before settling for Likely. For Likely, Predicted and
Unexplained findings, name the data that would settle it. Add a few words when
strength varies, for example: "Likely; reversed in one term."

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

Give the report as your reply, once; don't add it to the course unless the
instructor asks for a file, and don't follow it with a summary of itself.

Write for an instructor reading in a narrow chat panel. Lead with what to
change. Say what each question asks in plain words, so the instructor doesn't
have to open it. Use measures that need no explanation: mean score, share with
full credit, minutes, and points out of the assessment total. Keep the whole
reply to about 400 words plus one table.

Use this shape, adapting it to the assessment:

```markdown
**Bottom line**

- <Up to three bullets, most important first: what to change and why.>

| Question                  | What it asks                                | Students | Mean score |
| ------------------------- | ------------------------------------------- | -------- | ---------- |
| **4** (1 of 2, 17 points) |                                             | 226      | 76.9%      |
| ↳ **4.1**                 | Pin in a slot: find the **acceleration**    | 112      | **66.9%**  |
| ↳ 4.2                     | Four-bar linkage: find the angular velocity | 114      | 86.8%      |

### <The idea, in a sentence: "4.1 is harder when the slot is diagonal">

<Two or three numbers that show it, each with its number of students.>
**Why:** <the cause in the question, in a sentence or two, linking the file>
**Fix:** <a concrete change, or "No change needed">
_<Confidence label, and what would settle it if not Observed.>_

**Also checked:** <one line: slots that are well matched, gaps judged to be noise>

**About the data:** <two or three sentences: the course instance and number of
students, what was left out, and anything that limits the numbers, such as
score changes by staff or missing times.>
```

- **The table** covers the main offering: a bold row per slot that has
  alternatives, then a row per alternative, with the part that differs in bold.
  Bold an alternative that is 10 or more points from its slot. The panel is
  narrow, so keep to these four columns and to question numbers in the first;
  name QIDs in the findings instead. Leave out slots with one question unless
  one is a finding.
- **Findings** are ordered by effect on students: how many were affected and by
  how many points. Give two to four, each under about 70 words. Merge related
  minor ones, and move small issues to "Also checked".
- **Problems with the data** go in "About the data", not the lead. Open with
  what the results show, and mention a data problem earlier only when it
  changes a conclusion.
- **Questions for the instructor** go in one closing line, and only for
  decisions you can't make.
- Offer the detail you left out, such as every offering's numbers or how a
  measure was computed, instead of including it.

## Before handing off

- Recompute the numbers each finding uses from the downloaded data, including
  ranges and claims like "in every offering".
- Confirm each finding cites a source or is marked Unexplained.
- Confirm the step 3 explanations were ruled out for each finding.
- Confirm the report contains no user IDs or per-student rows.
- Reread the bottom line: could the instructor act on it alone?
- Cut anything the instructor doesn't need in order to decide.

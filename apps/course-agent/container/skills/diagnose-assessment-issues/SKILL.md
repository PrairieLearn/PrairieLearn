---
name: diagnose-assessment-issues
description: Diagnose problems in a PrairieLearn assessment from past student results and the question source, such as alternatives that aren't comparable, questions that take far longer than intended, and grading that distorts scores. Use for requests such as "How did Quiz 4 go?", "Were the variants fair?", or "What should we fix in Quiz 6 before next term?" Reports recommended edits without making them.
---

# Diagnose assessment issues

When you're done, the instructor should know **which questions to change, how,
and why**, after about two minutes of reading. Every claim must be supported by
the data or the question source.

Statistics tell you where to look. The question source tells you why. A gap
between two numbers isn't a finding until you can point to what in the question,
grader, or assessment setup causes it, or say plainly that you couldn't.

## Boundaries

- **Read-only.** Don't edit course files; the skill ends with the report. Grade
  changes stay with the instructor; point them to PrairieLearn's score tools.
- **Aggregate results only.** Never show user IDs, per-student rows, or quotes
  of free-text answers, and never copy student identifiers from course files
  (access rules can list emails) or attachments.
- **Ask only when blocked.** If you can't tell which assessment is meant, ask
  one question and recommend an answer. Otherwise make reasonable choices and
  state them in the report.

Use the terms instructors see in PrairieLearn and its docs, such as [assessment
configuration](https://docs.prairielearn.com/assessment/configuration/) for
zones, alternatives, `numberChoose`, `bestQuestions`, and points lists.

## 1. Establish scope

- **The assessment,** from the page the instructor is viewing when they don't
  name it. Use any goals the course states, such as intended time or
  difficulty, in a design guide or earlier report.
- **The offering they mean.** Read "last fall" as the most recent completed term
  with that name, and say so. If several course instances match, such as
  another campus, use the one with data.
- **The current definition,** where fixes apply. Check whether it has already
  been given.
- **Past offerings of the same assessment,** matched by their questions, not
  just names, to check whether a pattern is stable. Other assessments in the
  course are for comparison only.
- **Each offering's structure,** from its `infoAssessment.json` (and Git
  history for what it was when students took it): which questions compete for
  a slot, points and retry schedules, choose-N and best-N zones, manual or auto
  grading, and exam length, which may live outside PrairieLearn.

Number questions as the assessment's **Questions** page does: each entry in a
zone's list from 1, continuing across zones, with alternatives as 6.1, 6.2. The
`number` column in course data counts every alternative separately, so don't
report it.

## 2. Measure

Download results with the course data tools, filtered to the assessments you're
analyzing, and join them on their ID columns read as text. Count only attempts
with `include_in_statistics`. For each question with points, in each offering:
number assigned, mean final score, share with full credit, mean
first-submission score, mean attempts (graded submissions), median time, and
share with no submission. Compute these yourself; precomputed statistics can be
stale. Keep offerings separate unless their definitions are identical, and show
alternatives side by side with their sample sizes. Use each student's first
graded submission for initial mistakes and the best one for the recorded score;
when students get many attempts at full value, per-part results on the best
submission say more than first scores or attempt counts.

Add the evidence a candidate needs:

- **Time pressure:** the share finishing near the limit. Durations include idle
  time, so use medians. If the limit isn't recorded, use the 90th percentile of
  total duration and say it's inferred.
- **Effect on students:** points of the assessment total that students who drew
  an alternative lost or gained against those who drew the others.
- **Where students went wrong:** per-part scores, submitted answers against the
  variant's true answer, generated parameters, and grader feedback. These
  columns are large, so download them only for the questions a finding depends
  on, and report counts and shares.

Watch for: scores staff overrode (check every question, and report the effect
with and without them); manually graded questions, whose durations and
submission scores can be empty; saved but ungraded exam submissions; and
timestamps in UTC, converted to the course instance's timezone before grouping
by day. If totals or times look wrong, analyze the per-question rows and say
what was unusable. Course data can't show rubric items applied, uploaded files,
or who graded; the assessment's **Downloads** page has them. With no results at
all, review the source only and say so at the top.

## 3. Find candidates, then rule out other explanations

Candidates: alternatives in one slot that differ on score, time, attempts or
non-submission, especially when the gap repeats; similar scores that hide a
workload difference; questions far from the intended time or difficulty (with
no target, compare with other slots worth the same points); shifts between
offerings; and grading that differs between alternatives.

Before believing one, rule out small samples, non-random assignment (such as a
different alternative on different exam days; check by date), students choosing
what to attempt, stronger or weaker groups (compare questions that didn't
change), staff score changes, question edits between offerings (Git history),
and course-wide changes. A gap that reverses between offerings with no
explanation is unstable, not a harder variant.

## 4. Explain each candidate from the source

Read the alternatives side by side: prompt, generator, grader or tests, and
starter code. Decide from what these questions ask which differences could
change difficulty or workload, such as more steps, less scaffolding, tests or
parameter ranges only one has, grading weights, tolerances or sign conventions,
ambiguous wording, or parameters that produce degenerate cases. The standard is
**comparable difficulty and workload for everyone who could draw the slot**,
not identical questions; if a difference looks intentional, frame the problem
as an unfair draw.

Test each explanation against the data: if you suspect an extra step, do
students need more submissions or time on that alternative? A cause stays
"likely" until per-part scores, answers, or parameters show where students went
wrong, so check them first.

## 5. Recommend edits

Give each finding the smallest change that fixes it and keeps what the
instructor intended: a question file, an assessment setting (such as moving a
question to another slot), a rubric, or a process step. Say "No edit needed" or
"Already fixed in the current definition" when that's the honest answer. If a
past offering was clearly unequal, state the effect in points and leave grade
changes to the instructor.

## Report

Give the report as your reply, once, and don't follow it with a summary of
itself. The reader is an instructor reading it in a narrow chat panel.
Keep it to about 300 words plus the table. The two opening lines are all that
comes before the table.

```markdown
**<Assessment> · <course instance> · <number> students**

**<Number> fixes.** <Whether the current definition still has them, or "Nothing needs fixing.">

| Question                                                                   | Students |    Mean | Difference |
| -------------------------------------------------------------------------- | -------: | ------: | ---------: |
| 1 · <what it asks> · 10 pts                                                |      240 |     88% |            |
| 2 · <what they have in common> · 4 alternatives, 2 per student, 5 pts each |      240 |  90–96% | within ±4% |
| ⚠️ **3 · <what they have in common> · 2 alternatives, 15 pts**             |  **238** | **72%** |            |
| ↳ ⚠️ **3.1 · <what it asks>**                                              |  **119** | **62%** |   **−10%** |
| ↳ 3.2 · <what it asks>                                                     |      119 |     82% |       +10% |

**⚠️ 1. <The fix, as an instruction>**

<Its effect: which students lost how many points of the assessment total.>

- <The two or three numbers that show it, each with its number of students.>
- <What rules out other explanations, when a reader would wonder.>
- <Why, Likely why, or Cause not found: the cause, linking the file it's in.>

→ <The concrete edit, linking the file to change.>

**Worth a look**

- <A smaller or unexplained issue, in one line.>

<One line naming the questions that are well matched.>

_Data: <the offering and number of students, what was left out, and anything
that limits the conclusions, in one or two sentences.>_
```

**The table** lists every question with points, in the order of the
**Questions** page:

- Keep to these four columns and headers. A question's cell gives its number,
  what it asks in a few plain words a colleague would recognize, then its
  structure and points.
- **Students** counts students given that question, alternative, or group of
  variants, not attempts.
- Expand a question into a row per alternative only when it has a problem;
  otherwise give the range of its alternatives' means and their largest
  difference. When the problem is among an alternative's variants, add a row
  per group of variants under it.
- Means are whole percents. **Difference** is a row's mean minus its question
  row's mean, with sign and %, such as −10% when the row has 62% and its
  question 72%; never a relative change. Question rows leave it empty.
- Mark only the rows whose students were put at a disadvantage, and the question
  row above them: ⚠️ before the number, and the whole row in bold. No other
  emoji or symbols besides ↳, and no footnotes or legend.
- Name QIDs in the fixes, not the table.

**Fixes** are the problems that need an edit, ordered by effect on students:
how many were affected and by how many points. Give at most four.

- The heading is the instruction, numbered and marked ⚠️, and the line under it
  gives the effect.
- Say how sure you are in words: "Why:" when the data shows the cause
  directly, "Likely why:" when the source and data support it, "Predicted from
  the source; no student data yet", or "Cause not found". For anything short
  of "Why:", name the data that would settle it in a few words.
- End every fix with a → line: one concrete edit, such as a question file, an
  assessment setting, a rubric, or a process step. If the current definition
  already fixes it, say so instead.
- Link every course file you name by its full path, such as
  `[server.py](/workspace/session/course/questions/<qid>/server.py)`. The panel
  opens only links in that form.
- Keep each fix under about 60 words.

**Worth a look** holds unexplained gaps, issues too small to need an edit, and
questions that are hard for everyone alike. Leave it out when it's empty.

Problems with the data go in the closing data line, in at most two sentences.
Include only limits that change how the numbers should be read, not what you
filtered or that no files changed. Questions for the instructor go in one line
after it, only for decisions you can't make. Offer the detail you left out
instead of including it.

## Before handing off

- Recompute every number a finding uses, including ranges and claims like "in
  every offering".
- Check each difference against its question row, and that the rows marked ⚠️
  are exactly the ones the fixes are about.
- Confirm each finding cites a source or says the cause wasn't found, and that
  the other explanations were ruled out.
- Confirm there are no user IDs or per-student rows.
- Cut anything the instructor doesn't need in order to decide.

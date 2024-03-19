# Remote exam configurations

This page lists sample assessment configurations for remote exams, where students are not physically present in the same location as the proctors.

_See the [Access control](accessControl.md) page for details on `allowAccess` rules._

## Exams in the Computer-Based Testing Facility (CBTF)

If you are using the CBTF for remote proctoring then the access control should look like:

```json
"allowAccess": [
    {
        "mode": "Exam",
        "examUuid": "c48e40db-258d-43c8-bb26-1f559ffe2228",
        "credit": 100
    }
],
```

Some notes about this configuration:

- The `examUuid` parameter should be copied from PrairieTest for the specific exam. Each exam has its own unique `examUuid` and it's vital that the correct value is used for each separate exam.
- Date restrictions and time limits must not be set for the exam. All limits will be automatically enforced by the CBTF on a per-student basis, taking into account conflict exams and disability accommodations.

## CBTF exams with a few students outside the CBTF

Sometimes exams in the CBTF ([see above](#exams-in-the-computer-based-testing-facility-cbtf)) need to have a few students take the exam without CBTF proctoring, for example if they have missed the exam and need to take it later without proctoring. The access control for this should look like:

```json
"allowAccess": [
    {
        "mode": "Exam",
        "examUuid": "c48e40db-258d-43c8-bb26-1f559ffe2228",
        "credit": 100
    },
    {
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T11:00:00",
        "endDate": "2020-04-20T12:40:00",
        "timeLimitMin": 90
    }
],
```

Some notes about this configuration:

- See the [next section](#synchronous-timed-exams) for more details on the extra rule for the unproctored students.
- The additional access rules for specific students can be added at any time, including after other students already completed the CBTF exam. This is useful to set up accommodations for students that missed the exam.
- The order of the extra access rules is not important.

## Synchronous, timed exams

**We recommend that non-CBTF exams should be run using a synchronous, timed configuration.** Below is an example of an assessment configured to have students taking the exam at the same time with a time limit.

This configuration is good when:

- Almost all students take the exam at the same time
- Some students have accommodations, such as 1.5x time — **these students must be listed first in the access rules**
- Some students take the exam at a later "conflict" time, mainly because they are in a different timezone

```json
"allowAccess": [
    {
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T11:00:00",
        "endDate": "2020-04-20T12:40:00",
        "timeLimitMin": 90,
        "showClosedAssessment": false
    },
    {
        "uids": ["student3@illinois.edu", "student4@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T23:00:00",
        "endDate": "2020-04-21T00:05:00",
        "timeLimitMin": 60,
        "showClosedAssessment": false
    },
    {
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T11:00:00",
        "endDate": "2020-04-20T12:05:00",
        "timeLimitMin": 60,
        "showClosedAssessment": false
    },
    {
        "active": false,
        "showClosedAssessment": false
    }
],
```

Some notes about this configuration:

- The exam window (65 minutes, `startDate` to `endDate`) has been set to be 5 minutes longer than the exam time limit (60 minutes). However, students will not be able to access the exam past the `endDate` time under any circumstances. If a student starts this exam more than 5 minutes late, then the countdown timer on their exam will reflect the time remaining until `endDate`.
- If a student closes their web browser accidentally during an exam, they can just re-open it and continue taking the exam where they left off. They can even switch computers and just login to PrairieLearn again, and continuing taking their exam on the new computer. The timer does not pause when the web browser is closed. The timer is always in "wall time", meaning the same as a physical clock on the wall.
- Remember to extend both `endDate` _and_ `timeLimitMin` for students with extra-time accommodations.
- Students who are scheduled for a conflict exam will also be able to access the exam during the primary time slot. However, if they do so, they will be blocked from the exam during the conflict time slot.
- After the timer expires the exam will auto-close and grade any saved but ungraded questions and show students their final score. After this time students will be unable to see any of the questions.
- If a student closes their web browser before the exam is complete, their exam will be automatically closed and graded within 12 minutes after their timer expires. If they try and access their exam during this time it will immediately close and grade.
- Before downloading final scores, wait at least 12 minutes after the last student would have finished to ensure all exams are closed. You can also check (and manually close exams) on the "Students" page under the assessment in PrairieLearn.
- This configuration sets `"showClosedAssessment": false` to prevent students from seeing the details of their exam after it is over. This can help to mitigate cheating with students taking conflict exams. The final access rule containing only `"showClosedAssessment": false` is necessary because the earlier rules will only apply up until their `endDate` times. The additional `"active": false` restriction here prevents students from starting the exam after the `endDate`.

## Asynchronous, timed exams

We do **NOT** recommend exams to be run using this configuration (asynchronous with time limit) for high-stakes exams. While giving exams asynchronously will simplify exam administration and provide students with more flexibility, it comes at the expense of making it easier to cheat. We recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- Students can choose when to take the exam over a long period (typically about 24 hours)
- Once a student starts working on the exam, they have limited time (1 hour in the example below)
- Some students have accommodations, such as 1.5x time — **these students must be listed first in the access rules**
- There is no need for conflict exams because students can choose their own time

```json
"allowAccess": [
    {
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T06:00:00",
        "endDate": "2020-04-21T06:00:00",
        "timeLimitMin": 90,
        "showClosedAssessment": false
    },
    {
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T06:00:00",
        "endDate": "2020-04-21T06:00:00",
        "timeLimitMin": 60,
        "showClosedAssessment": false
    },
    {
        "active": false,
        "showClosedAssessment": false
    }
],
```

Some notes about this configuration:

- All of the the [notes above](#synchronous-timed-exams) still apply
- It's a good idea to run exams early-morning to early-morning. Having an `endDate` at 6am is ideal. This avoids having a pile-up at the end of the testing window, because 4am to 7am is the time period when undergraduates are least likely to be active (based on PrairieLearn usage data). Pile-ups near the end are bad because some students always get confused about exactly when the window will close, and end up with less time than they should. Starting at 6am also allows students to take the exam early in morning if they want.

## Post-graded exams

This post-graded configuration is **NOT** our recommended approach, but it is good for mimicking traditional pen-and-paper exams. Exams run in this manner forfeit the ability to provide immediate feedback as well as partial credit to students. Instead, we recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- You want to mimic a pen-and-paper exam as much as possible.
- You have a Scantron exam you would like to convert to PrairieLearn.
- You want to prevent students from finding out which questions they answered correctly.
- The exam only contains multiple-choice questions or very simple numeric questions. More complex questions need to allow students multiple attempts, which this configuration disables by turning off real-time grading.

```json
"allowRealTimeGrading": false,
"allowAccess": [
    {
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T11:00:00",
        "endDate": "2020-04-20T12:40:00",
        "timeLimitMin": 90,
        "showClosedAssessment": false
    },
    {
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T11:00:00",
        "endDate": "2020-04-20T12:10:00",
        "timeLimitMin": 60,
        "showClosedAssessment": false
    },
    {
        "uids": ["student3@illinois.edu", "student4@illinois.edu"],
        "mode": "Public",
        "credit": 100,
        "startDate": "2020-04-20T23:00:00",
        "endDate": "2020-04-21T00:10:00",
        "timeLimitMin": 60,
        "showClosedAssessment": false
    },
    {
        "active": false,
        "showClosedAssessment": false
    }
],
```

Some notes about this configuration:

- All of the the [notes above for synchronous, timed exams](#synchronous-timed-exams) still apply.
- The only change between this configuration and the [synchronous, timed](#synchronous-timed-exams) configuration above is the addition of the `"allowRealTimeGrading": false`. [Disabling real-time grading](assessment.md#disabling-real-time-grading) will hide the "Save & Grade" button on student question pages; only the "Save" button will be available. The "Grade saved answers" button on the assessment overview will also be hidden.
- When they are doing the exam, students can save answers to a question as many times as they like. When the exam finishes, the most recent saved answer for each question (if any) will be graded. Any earlier saved answers will be ignored.
- With this configuration students will never see their grading results for specific questions. This is because `"allowRealTimeGrading": false` disallows grading _during_ the exam, and `"showClosedAssessment": false` hides per-question grading results _after_ the exam is over.
- To prevent students from seeing their total exam score as soon as the exam is over, set `"showClosedAssessmentScore": false`, otherwise the students will see their total score (even if the per-question score is hidden).
- Having real-time grading disabled means that students are unable to re-attempt questions. This means you should not include complex numeric or programming questions, because students will often need multiple attempts at a question after grading feedback to correct minor typos and errors.
- It's possible to also combine this configuration with [asynchronous, timed](#asynchronous-timed-exams) by adding `"allowRealTimeGrading": false` to that configuration above.

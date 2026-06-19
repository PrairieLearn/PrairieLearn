# Remote exam configurations

This page lists sample assessment configurations for remote exams, where students are not physically present in the same location as the proctors.

These examples use [`accessControl`](accessControl.md). Existing assessments that still use `allowAccess` can use the [legacy access control](accessControlLegacy.md) documentation.

Student-specific access overrides are managed from the assessment **Access** page and are stored in PrairieLearn. The JSON examples below use [student labels](../courseInstance/index.md#student-labels) for repeated cohorts such as conflict exams, remote makeups, and extra-time accommodations.

## Exams in a PrairieTest-managed testing center

For a PrairieTest-only access path, configure the PrairieTest exam UUID and leave date control disabled:

```json
{
  "accessControl": [
    {
      "integrations": {
        "prairieTest": {
          "exams": [
            {
              "examUuid": "c48e40db-258d-43c8-bb26-1f559ffe2228"
            }
          ]
        }
      }
    }
  ]
}
```

Some notes about this configuration:

- The `examUuid` parameter should be copied from PrairieTest for the specific exam. Each exam has its own unique `examUuid`, and it's vital that the correct value is used for each separate exam.
- Do not configure date control or a PrairieLearn time limit unless students should have a non-PrairieTest access path. PrairieTest enforces scheduling and time limits, including conflict exams and disability accommodations.
- Use the PrairieTest exam's after-completion visibility setting if students should not review questions or scores after finishing while their reservation is still active.

## Testing center exams with a few students outside the testing center

Sometimes exams in a testing center ([see above](#exams-in-a-prairietest-managed-testing-center)) need to have a few students take the exam without PrairieTest proctoring, for example if they have missed the exam and need to take it later without proctoring. For one-off students, add student-specific overrides from the assessment **Access** page. For a repeated cohort, create a student label such as "Remote makeup" and configure a label override:

```json
{
  "accessControl": [
    {
      "integrations": {
        "prairieTest": {
          "exams": [
            {
              "examUuid": "c48e40db-258d-43c8-bb26-1f559ffe2228"
            }
          ]
        }
      }
    },
    {
      "uuid": "22222222-2222-4222-8222-222222222222",
      "labels": ["Remote makeup"],
      "dateControl": {
        "release": { "date": "2020-04-20T11:00:00" },
        "due": { "date": "2020-04-20T12:40:00" },
        "durationMinutes": 90
      }
    }
  ]
}
```

Some notes about this configuration:

- The label override uses [date control](accessControl.md#date-control) to create an unproctored access window with its own [time limit](accessControl.md#time-limits). See the [synchronous exam notes](#synchronous-timed-exams) for details about choosing the window and time limit.
- The override can be added at any time, including after other students already completed the exam using PrairieTest. This is useful for accommodations or makeup exams.

## Synchronous, timed exams

!!! tip

    We recommend that exams held outside a controlled testing center should be run using a synchronous, timed configuration.

Below is an example of an assessment configured to have students taking the exam at the same time with a time limit.

This configuration is good when:

- Almost all students take the exam at the same time
- Some students have accommodations, such as 1.5x time

  !!! warning

        Students with custom accommodations should use student-specific overrides or student-label overrides. If a student matches multiple label overrides, [override priority](accessControl.md#override-priority) determines which settings apply.

- Some students take the exam at a later "conflict" time, mainly because they are in a different timezone

```json
{
  "accessControl": [
    {
      "dateControl": {
        "release": { "date": "2020-04-20T11:00:00" },
        "due": { "date": "2020-04-20T12:05:00" },
        "durationMinutes": 60
      },
      "afterComplete": {
        "questions": { "hidden": true }
      }
    },
    {
      "uuid": "22222222-2222-4222-8222-222222222222",
      "labels": ["Extended time"],
      "dateControl": {
        "release": { "date": "2020-04-20T11:00:00" },
        "due": { "date": "2020-04-20T12:40:00" },
        "durationMinutes": 90
      }
    },
    {
      "uuid": "33333333-3333-4333-8333-333333333333",
      "labels": ["Conflict exam"],
      "dateControl": {
        "release": { "date": "2020-04-20T23:00:00" },
        "due": { "date": "2020-04-21T00:05:00" },
        "durationMinutes": 60
      }
    }
  ]
}
```

Some notes about this configuration:

- The exam window (65 minutes, `release` to `due`) has been set to be 5 minutes longer than the exam time limit (60 minutes). However, students will not be able to submit past the `due` time under any circumstances. If a student starts this exam more than 5 minutes late, then the countdown timer on their exam will reflect the time remaining until `due`.
- If a student closes their web browser accidentally during an exam, they can just re-open it and continue taking the exam where they left off. They can even switch computers and login to PrairieLearn again, and continue taking their exam on the new computer. The timer does not pause when the web browser is closed. The timer is always in "wall time", meaning the same as a physical clock on the wall.
- Remember to extend both the `due` date and `durationMinutes` for students with extra-time accommodations.
- Students who need both a conflict exam and extra time should receive a student-specific override, or a dedicated label override listed below the other matching overrides.
- After the timer expires the exam will auto-close and grade any saved but ungraded questions. Students cannot submit after their timer expires or after the `due` time, whichever comes first. Once the assessment is complete, students can see their final score but cannot review any questions.
- If a student closes their web browser before the exam is complete, their exam will be automatically closed and graded within 12 minutes after their timer expires. If they try and access their exam during this time it will immediately close and grade.
- Before downloading final scores, wait at least 12 minutes after the last student would have finished (to ensure all exams are closed). You can also check (and manually close exams) on the "Students" page under the assessment in PrairieLearn.
- Because no after-deadline submission mode is configured, submissions are not allowed after the `due` time. The [`afterComplete.questions.hidden`](accessControl.md#after-completion) setting keeps completed exam questions hidden while the total score remains visible by default. This does not prevent students from seeing questions or grading feedback while they are taking the exam.

## Asynchronous, timed exams

We do **NOT** recommend exams to be run using this configuration (asynchronous with time limit) for high-stakes exams. While giving exams asynchronously will simplify exam administration and provide students with more flexibility, it comes at the expense of making it easier to cheat. We recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- Students can choose when to take the exam over a long period (typically about 24 hours)
- Once a student starts working on the exam, they have limited time (1 hour in the example below)
- Some students have accommodations, such as 1.5x time

  !!! warning

        Students with custom accommodations should use student-specific overrides or student-label overrides. If a student matches multiple label overrides, [override priority](accessControl.md#override-priority) determines which settings apply.

- There is no need for conflict exams because students can choose their own time

```json
{
  "accessControl": [
    {
      "dateControl": {
        "release": { "date": "2020-04-20T06:00:00" },
        "due": { "date": "2020-04-21T06:00:00" },
        "durationMinutes": 60
      },
      "afterComplete": {
        "questions": { "hidden": true }
      }
    },
    {
      "uuid": "22222222-2222-4222-8222-222222222222",
      "labels": ["Extended time"],
      "dateControl": {
        "durationMinutes": 90
      }
    }
  ]
}
```

Some notes about this configuration:

- All of the [notes above](#synchronous-timed-exams) still apply.
- It's a good idea to run exams early-morning to early-morning. Having a `due` date at 6am is ideal. This avoids having a pile-up at the end of the testing window, because 4am to 7am is the time period when undergraduates are least likely to be active (based on PrairieLearn usage data). Pile-ups near the end are bad because some students always get confused about exactly when the window will close, and end up with less time than they should. Starting at 6am also allows students to take the exam early in morning if they want.

## Post-graded exams

This post-graded configuration is **NOT** our recommended approach, but it is good for mimicking traditional pen-and-paper exams. Exams run in this manner forfeit the ability to provide immediate feedback as well as partial credit to students. Instead, we recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- You want to mimic a pen-and-paper exam as much as possible.
- You have a Scantron exam you would like to convert to PrairieLearn.
- You want to prevent students from finding out which questions they answered correctly.
- The exam only contains multiple-choice questions or very simple numeric questions. More complex questions need to allow students multiple attempts, which this configuration disables by turning off real-time grading.

```json
{
  "allowRealTimeGrading": false,
  "accessControl": [
    {
      "dateControl": {
        "release": { "date": "2020-04-20T11:00:00" },
        "due": { "date": "2020-04-20T12:10:00" },
        "durationMinutes": 60
      },
      "afterComplete": {
        "questions": { "hidden": true }
      }
    },
    {
      "uuid": "22222222-2222-4222-8222-222222222222",
      "labels": ["Extended time"],
      "dateControl": {
        "release": { "date": "2020-04-20T11:00:00" },
        "due": { "date": "2020-04-20T12:40:00" },
        "durationMinutes": 90
      }
    },
    {
      "uuid": "33333333-3333-4333-8333-333333333333",
      "labels": ["Conflict exam"],
      "dateControl": {
        "release": { "date": "2020-04-20T23:00:00" },
        "due": { "date": "2020-04-21T00:10:00" },
        "durationMinutes": 60
      }
    }
  ]
}
```

Some notes about this configuration:

- All of the [notes above for synchronous, timed exams](#synchronous-timed-exams) still apply.
- The important change from the [synchronous, timed](#synchronous-timed-exams) configuration above is the addition of `"allowRealTimeGrading": false`. [Disabling real-time grading](configuration.md#disabling-real-time-grading) will hide the "Save & Grade" button on student question pages; only the "Save" button will be available. The "Grade saved answers" button on the assessment overview will also be hidden.
- When they are doing the exam, students can save answers to a question as many times as they like. When the exam finishes, the most recent saved answer for each question (if any) will be graded. Any earlier saved answers will be ignored.
- With this configuration students will never see their grading results for specific questions. This is because `"allowRealTimeGrading": false` disallows grading _during_ the exam, and `afterComplete.questions.hidden` hides per-question grading results _after_ the exam is over.
- To prevent students from seeing their total exam score after their assessment is graded, set `afterComplete.score.hidden` to `true`; otherwise the students will see their total score even if the per-question results are hidden.
- Having real-time grading disabled means that students are unable to re-attempt questions. This means you should not include complex numeric or programming questions, because students will often need multiple attempts at a question after grading feedback to correct minor typos and errors.
- It's possible to also combine this configuration with [asynchronous, timed](#asynchronous-timed-exams) by adding `"allowRealTimeGrading": false` to that configuration above.

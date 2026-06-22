# Remote exam configurations

This page walks through common assessment configurations for remote exams, where students are not physically present in the same location as the proctors.

Use the assessment **Access** page to configure availability, deadlines, time limits, PrairieTest access, after-completion visibility, and student-specific or student-label overrides.

These examples use [modern assessment access control](accessControl.md). Existing assessments that still use `allowAccess` can use the [legacy access control](accessControlLegacy.md) documentation.

Student-specific access overrides are managed from the assessment **Access** page. Use **Specific students** for assessment-specific groups such as one-off makeups or conflict times. Use [student labels](../courseInstance/index.md#student-labels) for groups that are maintained across multiple assessments, such as remote sections, online cohorts, or standing accommodation groups.

## Exams in a PrairieTest-managed testing center

For a PrairieTest-only access path, enable PrairieTest on the assessment and leave date control disabled.

In the UI:

1. Open the assessment **Access** tab.
2. Click **Edit** in **Defaults**.
3. Leave **Date control** disabled.
4. Under **Integrations**, enable **PrairieTest**.
5. Enter the PrairieTest exam UUID from the PrairieTest exam settings.
6. For **After completion**, choose what students can see after they finish while their reservation is still active.
7. Use the top-level **After completion** settings for what students can see after the reservation ends.
8. Click **Save**.

Some notes about this configuration:

- The PrairieTest exam UUID should be copied from PrairieTest for the specific exam. Each exam has its own unique UUID, and it's vital that the correct value is used for each separate exam.
- Do not configure date control or a PrairieLearn time limit unless students should have a non-PrairieTest access path. PrairieTest enforces scheduling and time limits, including conflict exams and disability accommodations.
- Use the PrairieTest exam's after-completion visibility setting if students should not review questions or scores after finishing while their reservation is still active.

??? info "JSON"

    ```json title="infoAssessment.json"
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

## Testing center exams with a few students outside the testing center

Sometimes exams in a testing center ([see above](#exams-in-a-prairietest-managed-testing-center)) need to have a few students take the exam without PrairieTest proctoring, for example if they missed the exam and need to take it later without proctoring. Start with the PrairieTest-only defaults, then add an override that gives the selected students a date-control access path.

Use a student-specific override for ordinary makeup exams, since the affected students usually change from assessment to assessment. Use a student label only when the same group should be managed together, such as a remote section, online cohort, or accommodation group that will use the same access pattern across multiple assessments.

In the UI:

1. Configure the defaults as a PrairieTest-only exam.
2. On the assessment **Access** page, click **Add override**.
3. Choose **Specific students** and select the enrolled students.
4. Click **Override** next to **Release** and set the remote exam start time.
5. Click **Override** next to **Due date** and set the remote exam end time.
6. Click **Override** next to **Time limit** and enter the working time for the remote exam.
7. Click **Save**.

Some notes about this configuration:

- The override uses [date control](accessControl.md#date-control) to create an unproctored access window with its own [time limit](accessControl.md#time-limits). See the [synchronous exam notes](#synchronous-timed-exams) for details about choosing the window and time limit.
- The override can be added at any time, including after other students already completed the exam using PrairieTest. This is useful for accommodations or makeup exams.
- For a reusable cohort, choose **Students by label** instead of **Specific students** and select the appropriate label, such as "Remote section".

??? info "JSON"

    This reference shows the reusable-cohort version using a student label. For ordinary specific-student makeups, configure the students in the Access page instead of adding UIDs to this JSON; PrairieLearn stores the selected student assignments separately from the rule body in `infoAssessment.json`.

    ```json title="infoAssessment.json"
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
          "labels": ["Remote section"],
          "dateControl": {
            "release": { "date": "2020-04-20T11:00:00" },
            "due": { "date": "2020-04-20T12:40:00" },
            "durationMinutes": 90
          }
        }
      ]
    }
    ```

## Synchronous, timed exams

!!! tip

    We recommend that exams held outside a controlled testing center should be run using a synchronous, timed configuration.

This configuration is good when:

- Almost all students take the exam at the same time.
- Some students have accommodations, such as 1.5x time.
- Some students take the exam at a later conflict time, mainly because they are in a different timezone.

!!! warning

    Use student-specific overrides for one-off conflict times or unusual combinations of accommodations. Use student-label overrides only for cohorts that are already maintained as labels or should intentionally be reused across assessments. If a student matches multiple label overrides, [override priority](accessControl.md#override-priority) determines which settings apply.

In the UI:

1. On the assessment **Access** page, click **Edit** in **Defaults**.
2. Enable **Date control**.
3. Set **Release** to the exam start time, such as Apr 20 at 11:00am.
4. Set **Due date** to slightly after the ordinary time limit, such as Apr 20 at 12:05pm for a 60-minute exam.
5. Enable **Time limit** and enter the ordinary working time, such as 60 minutes.
6. Leave **After due date** set to **No submissions allowed**.
7. Under **After completion**, set **Question visibility** to **Hide questions permanently**. Leave **Score visibility** visible after completion if students should see their total score.
8. For students with extra-time accommodations, click **Add override**. Choose **Students by label** if you already maintain an accommodation label such as "Extended time"; otherwise choose **Specific students**.
9. In the extra-time override, click **Override** next to **Due date** and **Time limit**. For 1.5x time on a 60-minute exam, use a 90-minute time limit and extend the due date to cover that time.
10. For students taking the exam at a later conflict time, click **Add override**. Choose **Specific students** unless this is a reusable cohort that should be managed by label.
11. In the conflict-time override, click **Override** next to **Release**, **Due date**, and **Time limit** for the later exam window.
12. For students who need both a conflict exam and extra time, add a student-specific override or a dedicated reusable-cohort label override listed below the other matching overrides.
13. Click **Save**.

Some notes about this configuration:

- The exam window has been set to be 5 minutes longer than the exam time limit. However, students will not be able to submit past the due time under any circumstances. If a student starts this exam more than 5 minutes late, then the countdown timer on their exam will reflect the time remaining until the due time.
- If a student closes their web browser accidentally during an exam, they can just re-open it and continue taking the exam where they left off. They can even switch computers and login to PrairieLearn again, and continue taking their exam on the new computer. The timer does not pause when the web browser is closed. The timer is always in "wall time", meaning the same as a physical clock on the wall.
- Remember to extend both the due date and time limit for students with extra-time accommodations.
- After the timer expires the exam will auto-close and grade any saved but ungraded questions. Students cannot submit after their timer expires or after the due time, whichever comes first. Once the assessment is complete, students can see their final score but cannot review any questions.
- If a student closes their web browser before the exam is complete, their exam will be automatically closed and graded within 12 minutes after their timer expires. If they try and access their exam during this time it will immediately close and grade.
- Before downloading final scores, wait at least 12 minutes after the last student would have finished to ensure all exams are closed. You can also check and manually close exams on the **Students** page under the assessment in PrairieLearn.
- Because no after-deadline submission mode is configured, submissions are not allowed after the due time. The **Question visibility** setting keeps completed exam questions hidden while the total score remains visible by default. This does not prevent students from seeing questions or grading feedback while they are taking the exam.

??? info "JSON"

    This reference shows an extra-time label override and a student-specific conflict-time rule body. Configure the selected students for the conflict-time override on the Access page; the selected student assignments are stored separately from the rule body in `infoAssessment.json`.

    ```json title="infoAssessment.json"
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
            "due": { "date": "2020-04-20T12:40:00" },
            "durationMinutes": 90
          }
        },
        {
          "uuid": "33333333-3333-4333-8333-333333333333",
          "dateControl": {
            "release": { "date": "2020-04-20T23:00:00" },
            "due": { "date": "2020-04-21T00:05:00" },
            "durationMinutes": 60
          }
        }
      ]
    }
    ```

## Asynchronous, timed exams

We do **NOT** recommend exams to be run using this configuration for high-stakes exams. While giving exams asynchronously will simplify exam administration and provide students with more flexibility, it comes at the expense of making it easier to cheat. We recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- Students can choose when to take the exam over a long period, typically about 24 hours.
- Once a student starts working on the exam, they have limited time, such as 1 hour.
- Some students have accommodations, such as 1.5x time.
- There is no need for conflict exams because students can choose their own time.

!!! warning

    Use student-label overrides only for cohorts that are already maintained as labels or should intentionally be reused across assessments. Otherwise, use student-specific overrides. If a student matches multiple label overrides, [override priority](accessControl.md#override-priority) determines which settings apply.

In the UI:

1. On the assessment **Access** page, click **Edit** in **Defaults**.
2. Enable **Date control**.
3. Set **Release** to the start of the availability period, such as Apr 20 at 6:00am.
4. Set **Due date** to the end of the availability period, such as Apr 21 at 6:00am.
5. Enable **Time limit** and enter the ordinary working time, such as 60 minutes.
6. Leave **After due date** set to **No submissions allowed**.
7. Under **After completion**, set **Question visibility** to **Hide questions permanently**.
8. For students with extra-time accommodations, click **Add override**. Choose **Students by label** if you already maintain an accommodation label such as "Extended time"; otherwise choose **Specific students**.
9. In the extra-time override, click **Override** next to **Time limit** and enter the accommodated working time, such as 90 minutes.
10. Click **Save**.

Some notes about this configuration:

- All of the [notes above](#synchronous-timed-exams) still apply.
- It's a good idea to run exams early-morning to early-morning. Having a due date at 6am is ideal. This avoids having a pile-up at the end of the testing window, because 4am to 7am is the time period when undergraduates are least likely to be active (based on PrairieLearn usage data). Pile-ups near the end are bad because some students always get confused about exactly when the window will close, and end up with less time than they should. Starting at 6am also allows students to take the exam early in morning if they want.

??? info "JSON"

    This reference shows the reusable-accommodation version using a student label. For one-off accommodations, configure the selected students on the Access page instead.

    ```json title="infoAssessment.json"
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

## Post-graded exams

This post-graded configuration is **NOT** our recommended approach, but it is good for mimicking traditional pen-and-paper exams. Exams run in this manner forfeit the ability to provide immediate feedback as well as partial credit to students. Instead, we recommend [synchronous, timed exams](#synchronous-timed-exams).

This configuration is good when:

- You want to mimic a pen-and-paper exam as much as possible.
- You have a Scantron exam you would like to convert to PrairieLearn.
- You want to prevent students from finding out which questions they answered correctly.
- The exam only contains multiple-choice questions or very simple numeric questions. More complex questions need to allow students multiple attempts, which this configuration disables by turning off real-time grading.

In the UI:

1. On the assessment **Settings** page, under **Grading**, clear **Allow real-time grading** and save the settings.
2. On the assessment **Access** page, click **Edit** in **Defaults**.
3. Enable **Date control**.
4. Set **Release** to the exam start time, such as Apr 20 at 11:00am.
5. Set **Due date** to the exam end time, such as Apr 20 at 12:10pm.
6. Enable **Time limit** and enter the ordinary working time, such as 60 minutes.
7. Under **After completion**, set **Question visibility** to **Hide questions permanently**.
8. For students with extra-time accommodations, click **Add override**. Choose **Students by label** if you already maintain an accommodation label such as "Extended time"; otherwise choose **Specific students**.
9. In the extra-time override, click **Override** next to **Due date** and **Time limit**. For 1.5x time on a 60-minute exam, use a 90-minute time limit and extend the due date to cover that time.
10. For students taking the exam at a later conflict time, click **Add override**. Choose **Specific students** unless this is a reusable cohort that should be managed by label.
11. In the conflict-time override, click **Override** next to **Release**, **Due date**, and **Time limit** for the later exam window.
12. Click **Save**.

Some notes about this configuration:

- Clearing **Allow real-time grading** hides the **Save & Grade** button on student question pages; only the **Save** button will be available. The **Grade saved answers** button on the assessment overview will also be hidden.
- When they are doing the exam, students can save answers to a question as many times as they like. When the exam finishes, the most recent saved answer for each question, if any, will be graded. Any earlier saved answers will be ignored.
- With this configuration students will never see their grading results for specific questions. This is because real-time grading is disabled during the exam, and **Question visibility** hides per-question grading results after the exam is over.
- To prevent students from seeing their total exam score after their assessment is graded, set **Score visibility** to **Hide score permanently**; otherwise the students will see their total score even if the per-question results are hidden.
- Having real-time grading disabled means that students are unable to re-attempt questions. This means you should not include complex numeric or programming questions, because students will often need multiple attempts at a question after grading feedback to correct minor typos and errors.
- It's possible to also combine this configuration with [asynchronous, timed](#asynchronous-timed-exams) by clearing **Allow real-time grading** on the assessment **Settings** page.

??? info "JSON"

    This reference shows an extra-time label override and a student-specific conflict-time rule body. Configure the selected students for the conflict-time override on the Access page; the selected student assignments are stored separately from the rule body in `infoAssessment.json`.

    ```json title="infoAssessment.json"
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
            "due": { "date": "2020-04-20T12:40:00" },
            "durationMinutes": 90
          }
        },
        {
          "uuid": "33333333-3333-4333-8333-333333333333",
          "dateControl": {
            "release": { "date": "2020-04-20T23:00:00" },
            "due": { "date": "2020-04-21T00:10:00" },
            "durationMinutes": 60
          }
        }
      ]
    }
    ```

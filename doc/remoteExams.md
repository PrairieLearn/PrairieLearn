
# Remote exam configurations

This page lists sample assessment configurations for remote exams, where students are not physically present in the same location as the proctors.

*See the [Access control](accessControl.md) page for details on `allowAccess` rules.*


## Synchronous, timed exams

This configuration is good when:

* Almost all students take the exam at the same time
* Some students have accommodations, such as 1.5x time — **these students must be listed first in the access rules**
* Some students take the exam at a later "conflict" time, mainly because they are in a different timezone

Some notes about this configuration:

* The exam window (70 minutes, `startDate` to `endDate`) has been set to be 10 minutes longer than the exam time limit (60 minutes). If a student starts the exam late, then the countdown timer on their exam will show the full exam time limit (60 minutes). However, they will not be able to access the exam past the `endDate` time under any circumstances. See [PL issue #2217](https://github.com/PrairieLearn/PrairieLearn/issues/2217) for details.
* If a student closes their web browser accidentally during an exam, they can just re-open it and continue taking the exam where they left off. They can even switch computers and just login to PrairieLearn again, and continuing taking their exam on the new computer. The timer does not pause when the web browser is closed. The timer is always in "wall time", meaning the same as a physical clock on the wall.
* Remember to extend both `endDate` *and* `timeLimitMin` for students with extra-time accommodations.
* Students who are scheduled for a conflict exam will be able to access the exam during the primary time slot. However, if they do so, they will be blocked from the exam during the conflict timeslot.
* After the timer expires the exam will auto-close and grade any saved but ungraded questions and show students their final score. After this time students will be unable to see any of the questions.
* If a student closes their web browser before the exam is complete, their exam will not automatically close. This is not a security problem because it will automatically close if they try to access it again. All exams will auto-close 6 hours after the end of the exam window.
* Before downloading final scores, either wait 6 hours after the end of the final exam window, or check and manually close any open exams on the "Students" page under the assessment in PrairieLearn.

```json
"allowAccess": [
    {
        "role": "TA",
        "credit": 100
    },
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
    }
],
```

## Asynchronous, timed exams

This configuration is good when:

* Students can choose when to take the exam over a long period (typically about 24 hours)
* Once a student starts working on the exam, they have limited time (1 hour in the example below)
* Some students have accommodations, such as 1.5x time — **these students must be listed first in the access rules**
* There is no need for conflict exams because students can choose their own time

Some notes about this configuration:

* All of the the [notes above](#synchronous-timed-exams) still apply
* It's a good idea to run exams early-morning to early-morning. Having an `endDate` at 6am is ideal. This avoids having a pile-up at the end of the testing window, because 4am to 7am is the time period when undergraduates are least likely to be active (based on PrairieLearn usage data). Pile-ups near the end are bad because some students always get confused about exactly when the window will close, and end up with less time than they should. Starting at 6am also allows students to take the exam early in morning if they want.

```json
"allowAccess": [
    {
        "role": "TA",
        "credit": 100
    },
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
    }
],
```

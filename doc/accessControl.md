
# Access control to course instances and assessments

By default, course instances and assessments are only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the corresponding `infoCourseInstance.json` or `infoAssessment.json` file.

The `allowAccess` rules in course instances and assessments do not grant authorization to sync course content from GitHub. This is controlled by [sync permissions](sync.md#sync-permissions).

## Two level of access control for assessments

In PrairieLearn there are two levels of access control to gain access to assessments:

1. First, a student or TA must have access to the **course instance**. This access is granted with the `allowAccess` rules in [infoCourseInstance.json](courseInstance.md). Giving a student or TA access to a course instance does not by default grant them access to any assessments in the course instance, however (see the next item).

2. Second, a student or TA must also have access to the specific **assessment**. This access is granted with the `allowAccess` rules in [infoAssessment.json](assessment.md). Even if a student has been granted access to an assessment, however, they will only be able to actually access it if they also have access to the course instance (see previous item).

Note that instructors for a course instance automatically have access to all assessments and questions in that course instance.

## `allowAccess` format

The general format of `allowAccess` is:

```json
"allowAccess": [
    { <accessRule1> },
    { <accessRule2> },
    { <accessRule3> }
],
```

Each `accessRule` is an object that specifies a set of circumstances under which the assessment is accessible. If any of the access rules gives access, then the assessment is accessible. Each access rule can have one or more restrictions as follows. The "courseInstance" and "assessment" columns indicate whether the restiction is available for the respective objects.

Access restriction | courseInstance | assessment | Meaning | Example
---                | ---            | ---        | ---     | ---
`role`             | ✓ | ✓ | Require at least this role to access.                               | `"role": "TA"`
`uids`             | ✓ | ✓ | Require one of the UIDs in the array to access.                     | `"uids": ["mwest@illinois.edu", "zilles@illinois.edu"]`
`startDate`        | ✓ | ✓ | Only allow access after this date.                                  | `"startDate": "2015-01-19T00:00:01"`
`endDate`          | ✓ | ✓ | Only access access before this date.                                | `"endDate": "2015-05-13T23:59:59"`
`institution`      | ✓ |   | Only people from this institution ("UIUC", "ZJUI", "LTI", or "Any"). | `"institution": "UIUC"`
`mode`             |   | ✓ | Only allow access from this server mode.                            | `"mode": "Exam"`
`credit`           |   | ✓ | Maximum credit as percentage of full credit (can be more than 100). | `"credit": 100`
`timeLimitMin`     |   | ✓ | Time limit in minutes to complete an assessment (only for Exams).   | `"timeLimitMin": 60`
`password`         |   | ✓ | Password required to start an assessment (only for Exams).          | `"password": "mysecret"`
`examUuid`         |   | ✓ | Exam scheduler UUID that students must register for.                | `"examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871"`

Each access rule will only grant access if all of the restrictions are satisfied.

In summary, `allowAccess` uses the algorithm:

```
each accessRule is True if (restriction1 AND restriction2 AND restriction3)
allowAccess is True if (accessRule1 OR accessRule2 OR accessRule3)
```

If multiple access rules are satisfied then the highest `credit` value is taken from them. Access rules without an explicit `credit` value have credit of 0, meaning they allow viewing of the assessment but not doing questions for credit.

## Roles

Restricting access to `"role": "Student"` is equivalent to not including a role restriction at all, because every user is equal to or higher than `Student` role.

## Dates

All dates are specified in the format "YYYY-MM-DDTHH:MM:SS" using 24-hour times (this is the [RFC 3339](https://www.ietf.org/rfc/rfc3339.txt) profile of [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)). All times are in Central Time (either CST or CDT as appropriate).

If you want to include full days, then it is generally best to start at 1 second after midnight, and end at 1 second before midnight. This avoids any confusion around the meaning of times exactly at midnight. For example, start at `2015-04-05T00:00:01` and end at `2015-04-07T23:59:59` for the 3-day window from April 5th to April 7th inclusive.

## Server modes

Each user accesses the PrairieLearn server in a `mode`, as listed below. This can be used to restrict access to assessments based on the current mode.

Mode      | When active
---       | ---
`Exam`    | When the student is on a computer in the Computer-Based Testing Facility (CBTF) labs (determined by IP range), or when the user has overridden the mode to be `Exam` (only possible for `Instructor`).
`Public`  | In all other cases.

## Credit

When the available credit is less than 100%, the percentage score is calculated as `min(credit, points / maxPoints * 100)`. However, the student's percentage score will never descrease, so if they've already earned a higher percentage score then they will keep it. For example, if `credit = 80` and `maxPoints = 10`, then when a student has `points = 8` then they will have a percentage score of 80%, and when they have `points = 9` or `points = 10` they will still have a percentage score of 80%.

When the available credit is more than 100%, then the percentage score is calculated as `points / maxPoints * 100` when `points < maxPoints`. However, if `points = maxPoints` then the percentage score is taken to be the credit value. For example, if `credit = 120` then the student will see their percentage score rise towards 100% as their `points` increase towards `maxPoints`, and then when their `points` reaches `maxPoints` their percentage score will suddenly jump to 120%.

## Time limits

For students taking remote exams it can be helpful to have an enforced time limit. This can be done with an access rule like:

```json
"allowAccess": [
    {
        "startDate": "2015-01-19T00:00:01",
        "endDate": "2015-05-13T23:59:59",
        "timeLimitMin": 50,
        "credit": 100
    }
]
```

The above example will give students 50 minutes for this exam, and they must start (and complete) within the date limits.

**Note that time limits should not be set for exams in the CBTF (Computer-Based Testing Facility). Instead, such exams should set `"mode": "Exam"` and the time limits will be enforced by the CBTF scheduling software.**

## Passwords

Remote or online exams sometimes use a “proctor password” to control access to Exams. This can be enabled with an access rule like:

```json
"allowAccess": [
    {
        "mode": "Public",
        "startDate": "2015-01-19T00:00:01",
        "endDate": "2015-05-13T23:59:59",
        "password": "mysecret",
        "credit": 100
    }
]
```

Before a student can do the exam, a proctor will need to type the phrase `mysecret` into the password field on the exam start page.

## Exam UUIDs

To require that students are taking a particular exam in the Computer-Based Testing Facility (CBTF), the `examUuid` should be set to the UUID value from the scheduler app. For example:

```
"allowAccess": [
    {
        "mode": "Exam",
        "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871",
        "credit": 100
    }
]
```

Note that in this case the `startDate` and `endDate` should *NOT* be specified. These will be automatically determined by the scheduler app and should not be set in PrairieLearn.

## Course instance example

```json
"allowAccess": [
    {
        "role": "TA",
        "startDate": "2015-01-10T00:00:01",
        "endDate": "2015-06-01T23:59:59"
    },
    {
        "startDate": "2015-01-19T00:00:01",
        "endDate": "2015-05-13T23:59:59"
    }
]
```

The above `allowAccess` rules are appropriate for a `infoCourseInstance.json` file. They say that TAs should have access from Jan 10ty through Jun 1st, while general access (no role restriction) is in the period Jan 19th through May 13th.

## Exam example

```json
"allowAccess": [
    {
        "mode": "Public",
        "role": "TA",
        "credit": 100,
        "startDate": "2014-08-20T00:00:01",
        "endDate": "2014-12-15T23:59:59"
    },
    {
        "mode": "Exam",
        "credit": 100,
        "startDate": "2014-09-07T00:00:01",
        "endDate": "2014-09-10T23:59:59"
    },
    {
        "mode": "Exam",
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "credit": 100,
        "startDate": "2014-09-12T00:00:01",
        "endDate": "2014-09-12T23:59:59"
    }
],
```

The above `allowAccess` directive is appropriate for an `Exam` assessment, and means that this assessment is available under three different circumstances and always for full credit. First, users who are at least a `TA` can access the assessment in `Public` mode during the whole of Fall semester. Second, any user can access this assessment in `Exam` mode from Sept 7th to Sept 10th. Third, there are two specific students who have access to take the exam on Sept 12th.

## Exam with remote students example

```json
"allowAccess": [
    {
        "role": "TA",
        "credit": 100
    },
    {
        "mode": "Exam",
        "credit": 100,
        "startDate": "2014-09-07T00:00:01",
        "endDate": "2014-09-10T23:59:59"
    },
    {
        "uids": ["student1@illinois.edu", "student2@illinois.edu"],
        "credit": 100,
        "startDate": "2014-09-07T00:00:01",
        "endDate": "2014-09-10T23:59:59",
        "timeLimitMin": 50
    }
],
```

The above `allowAccess` directive is appropriate for an `Exam` being taken by on-campus students in the CBTF and by remote students. First, TAs can access the assessment at any time. Second, anyone (i.e., on-campus students) can access the assessment in the CBTF (`"mode": "Exam"`) for full credit between Sept 7th to Sept 10th. Third, a defined set of students (remote students) can take the exam for full credit between the same dates. For the off-campus students we set a time limit (50 minutes). For on-campus students no time limit should be given because the time limit is enforced by the CBTF proctors.


## Homework example

```json
"allowAccess": [
    {
        "mode": "Public",
        "role": "TA",
        "credit": 100,
        "startDate": "2014-08-20T00:00:01",
        "endDate": "2014-12-15T23:59:59"
    },
    {
        "mode": "Public",
        "credit": 110,
        "startDate": "2014-10-12T00:00:01",
        "endDate": "2014-10-15T23:59:59"
    },
    {
        "mode": "Public",
        "credit": 100,
        "startDate": "2014-10-12T00:00:01",
        "endDate": "2014-10-18T23:59:59"
    },
    {
        "mode": "Public",
        "credit": 80,
        "startDate": "2014-10-12T00:00:01",
        "endDate": "2014-10-25T23:59:59"
    },
    {
        "mode": "Public",
        "startDate": "2014-10-12T00:00:01",
        "endDate": "2014-12-15T23:59:59"
    }
],
```

This `allowAccess` directive is suitable for a `Homework` assessment. It gives TAs access for the entire semester. Students can see the homework starting on Oct 12th, and the homework for them goes through four different stages: (1) they will earn a bonus 10% if they complete the homework before Oct 15th, (2) they get full credit until the due date of Oct 18th, (3) they can complete the homework up to a week late (Oct 25th) for 80% credit, and (4) they will be able to see the homework but not earn more points until the end of semester (Dec 15th).


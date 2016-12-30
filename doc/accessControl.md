
# Access control

By default, course instances and assessments are only accessible to `Instructor` users. To change this, the `allowAccess` option can be used in the corresponding `info.json` file.

## `allowAccess` format

The general format of `allowAccess` is:

```
"allowAccess": [
    { <accessRule1> },
    { <accessRule2> },
    { <accessRule3> }
],
```

Each `accessRule` is an object that specifies a set of circumstances under which the assessment is accessible. If any of the access rules gives access, then the assessment is accessible. Each access rule can have one or more restrictions:

Access restriction | Meaning
---                | ---
`mode`             | Only allow access from this server mode.
`role`             | Require at least this role to access.
`uids`             | Require one of the UIDs in the array to access.
`startDate`        | Only allow access after this date.
`endDate`          | Only access access before this date.
`credit`           | Maximum credit as percentage of full credit (can be more than 100).

Each access role will only grant access if all of the restrictions are satisfied.

In summary, `allowAccess` uses the algorithm:

```
each accessRule is True if (restriction1 AND restriction2 AND restriction3)
allowAccess is True if (accessRule1 OR accessRule2 OR accessRule3)
```

If multiple access rules are satisfied then the highest `credit` value is taken from them. Access rules without an explicit `credit` value have credit of 0, meaning they allow viewing of the assessment but not doing questions for credit.

## Server modes

Each user accesses the PrairieLearn server in a `mode`, as listed below. This can be used to restrict access to assessments based on the current mode.

Mode      | When active
---       | ---
`Exam`    | When the student is on a computer in the Computer-Based Testing Facility (CBTF) labs (determined by IP range), or when the user has overridden the mode to be `Exam` (only possible for `Instructor`).
`Public`  | In all other cases.
`Default` | An instructor-only mode on the client, which means that the server will act in its natural mode as determined by client IP. That is, a `Default` mode says to not override the mode to either of the other settings.

## Course instance example

FIXME

## Exam example

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

The above `allowAccess` directive means that this assessment is available under three different circumstances and always for full credit. First, users who are at least a `TA` can access the assessment in `Public` mode during the whole of Fall semester. Second, any user can access this assessment in `Exam` mode from Sept 7th to Sept 10th. Third, there are two specific students who have access to take the exam on Sept 12th.

## Homework example

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

This `allowAccess` directive gives TAs access for then entire semester. Students can see the homework starting on Oct 12th, and the homework for them goes through four different stages: (1) they will earn a bonus 10% if they complete the homework before Oct 15th, (2) they get full credit until the due date of Oct 18th, (3) they can complete the homework up to a week late (Oct 25th) for 80% credit, and (4) they will be able to see the homework but not earn more points until the end of semester (Dec 15th).



# Writing tests

## Server modes

Mode     | When active
-        | -
`Exam`   | When the user is on a computer in the Computer Based Testing Faciltiy labs (determined by IP range), or when the user has overridden the mode to be `Exam` (only possible for `Instructor`).
`Public` | In all other cases.

## Access control

By default, a test is accessible in `Public` mode to all users at any time, and is only available to `Instructor` users in `Exam` mode. To change these defaults, the `allowAccess` option can be used in the test's `info.json` file. As an example:

    "allowAccess": [
        {
            "mode": "Public",
            "role": "TA"
        },
        {
            "mode": "Exam",
            "startDate": "2014-07-07T00:00:01",
            "endDate": "2014-07-10T23:59:59"
        }
    ],

The above `allowAccess` directive means that this test is available under two different circumstances. First, users who are at least a `TA` can access the test in `Public` mode at any time. Second, any user can access this test in `Exam` mode from July 7th to July 10th.

The general format of `allowAccess` is:

    "allowAccess": [
        { < access rule 1 > },
        { < access rule 2 > },
        { < access rule 3 > }
    ],

Each `access rule` is an object that specifies a set of circumstances under which the test is accessible. If any of the access rules gives access, then the test is accessible. Each access rule can have one or more restrictions:

Access restriction | Meaning
- | -
`mode` | Only allow access from this server mode.
`role` | Require at least this role to access.
`startDate` | Only allow access after this date.
`endDate` | Only access access before this date.

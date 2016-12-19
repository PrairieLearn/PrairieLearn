
# Course configuration

## Directory layout

A course is specified by a single directory, with the following structure:

    exampleCourse
    |-- courseInfo.json # course specification (see below)
    |-- questions       # all questions for the course
    |   `-- ...         # one subdirectory per question
    |-- tests           # all the tests for the course
    |   `-- ...         # one subdirectory per test
    |-- clientCode      # library code that can be used in any question
    |   |-- library1.js
    |   `-- library2.js
    |-- serverCode      # code only accessible from server.js in questions
    |   `-- secretLibrary1.js
    `-- clientFiles     # general files available from the client at all time
        |-- refs.html
        `-- formulas.pdf

* [Example course directory](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse) in PrairieLearn


## `courseInfo.json`

This file specifies basic information about the course, like the title and users:

    {
        "name": "TAM 212",
        "title": "Introductory Dynamics",
        "userRoles": {
            "mwest@illinois.edu": "Instructor",
            "zilles@illinois.edu": "TA",
            "mussulma@illinois.edu": "TA"
        }
    }

* Example [courseInfo.json](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInfo.json)

* [Format specification for `courseInfo.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/courseInfo.json)


## User Roles

Each user has a single role assigned to them. These are:

Role         | Description
---          | ---
`Student`    | A student participating in the class. They can only see their own information, and can do do tests.
`TA`         | An assistant instructor. They can see the data of all users, but can only edit their own information.
`Instructor` | A person in charge of the course. Has full permission to see and edit the information of other users.
`Superuser`  | A server administrator. Has full access to everything.

User roles `Student` through `Instructor` can be set in the `courseConfig.json` file. The `Superuser` role can only be specified in the [server `config.json` file](https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/serverConfig.md).

The detailed list of permissions for each role is:

Operation                                                             | Student | TA  | Instructor | Superuser
---                                                                   | ---     | --- | ---        | ---
`overrideScore`: Submit question answers with pre-determined scores.  |         |     | Yes        | Yes
`overrideVID`: Load specific (non-random) instances of questions.     |         | Yes | Yes        | Yes
`seeQID`: See question ID strings.                                    |         | Yes | Yes        | Yes
`viewOtherUsers`: View data from any other user.                      |         | Yes | Yes        | Yes
`editOtherUsers`: Edit data from any other user.                      |         |     | Yes        | Yes
`changeMode`: Change the current interface mode (Public/Exam).        |         |     | Yes        | Yes
`seeAvailDate`: See the date availability information for tests.      |         | Yes | Yes        | Yes
`bypassAccess`: Bypass all access restrictions.                       |         |     | Yes        | Yes
`viewErrors`: See server error messages.                              |         |     | Yes        | Yes
`viewCoursePulls`: See git pulls of course data.                      |         | Yes | Yes        | Yes
`editCoursePulls`: Pull the course data from git.                     |         |     | Yes        | Yes
`deleteTInstances` : Delete and reset tests.                          |         |     | Yes        | Yes
`seeAdminPages` : View admin pages with extra options.                |         | Yes | Yes        | Yes
`createQIDWithoutTID`: View questions outside of a test.              |         |     | Yes        | Yes
`createQIDWithoutTIID`: View questions outside of a test instance.    |         | Yes | Yes        | Yes
Automatic access to all courses.                                      |         |     |            | Yes

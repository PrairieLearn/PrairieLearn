
# Course instance configuration

## Directory layout

A _course instance_ corresponds to a single offering of a [course](course.md), such as "Fall 2016", or possibly "Fall 2016, Section 1". A course instance like `Fa16` is contained in one directory and has a configuation file (`courseInstanceInfo.json`) and a list of [assessments](assessment.md) in an `assessments` subdirectory.

```
exampleCourse
`-- courseInstances
    +-- Fa16                          # Fall 2016 course instance
    |   +-- courseInstanceInfo.json   # configuration file (see below)
    |   +-- assessments
    |   |   +-- hw01                  # first homework for Fa16
    |   |   |   `-- ...               # files for Homework 1
    |   |   `-- hw02                  # second homework for Fa16
    |   |       `-- ...               # files for Homework 2
    |   +-- courseInstanceClientFiles
    |   |   `-- Fa16_rules.pdf        # files for Fall 2016
    |   `-- courseInstanceServerFiles
    |       `-- secret2.js            # files only accessible from the server
    `-- Sp17
        +-- courseInstanceInfo.json   # Spring 2017 configuration
        +-- assessments
        |   `-- ...                   # Spring 2017 assessments
        +-- courseInstanceClientFiles
        |   `-- ...                   # files for Spring 2017
        `-- courseInstanceServerFiles
            `-- ...                   # files only accessible from the server
```

* See an [example course instances directory](../exampleCourse/courseInstances) in PrairieLearn

* See [clientFiles and serverFiles](clientServerFiles.md) for information on the `courseClientFiles` and `courseServerFiles` directories.

## `courseInstanceInfo.json`

This file specifies basic information about the course instance:

```json
{
    "uuid": "62fbe2a4-8c22-471a-98fe-19e5d5da1bbe",
    "shortName": "Sp15",
    "longName": "Spring 2015",
    "userRoles": {
        "mwest@illinois.edu": "Instructor",
        "zilles@illinois.edu": "TA",
        "mussulma@illinois.edu": "TA"
    },
    "allowAccess": [
        {
            "startDate": "2015-01-19T00:00:01",
            "endDate": "2015-05-13T23:59:59"
        }
    ]
}
```

* Example [courseInstanceInfo.json](../exampleCourse/courseInstances/Sp15/courseInstanceInfo.json)

* [Format specification for `courseInstanceInfo.json`](../schemas/courseInstanceInfo.json)

## User roles

Each user has a single role assigned to them. These are:

Role         | Description
---          | ---
`Student`    | A student participating in the class. They can only see their own information, and can do do assessments.
`TA`         | A teaching assisstant. They can see the data of all users, but can only edit their own information.
`Instructor` | A person in charge of the course. Has full permission to see and edit the information of other users.
`Superuser`  | A server administrator. Has full access to everything.

User roles `Student` through `Instructor` can be set in the `courseConfig.json` file. The `Superuser` role can only be specified directly on the production server.


## Course instance `allowAccess`

See [Access control](https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/accessControl.md) for details.

The course instance `allowAccess` rules determine who can access the course instance and when they can do so. Instructors always have access. The simplest case gives everyone access between the start (Jan 19th) and end (May 13th) of the semester, as follows.

```json
    "allowAccess": [
        {
            "startDate": "2015-01-19T00:00:01",
            "endDate": "2015-05-13T23:59:59"
        }
    ]
```

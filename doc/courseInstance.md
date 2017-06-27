
# Course instance configuration

**NOTE:** Any time you edit or add an `infoCourseInstance.json` file on a local copy of PrairieLearn, you need to click the “Load from disk” button in the page header so that the local PrairieLearn server reloads the changes.

## Directory layout

A _course instance_ corresponds to a single offering of a [course](course.md), such as "Fall 2016", or possibly "Fall 2016, Section 1". A course instance like `Fa16` is contained in one directory and has a configuration file (`infoCourseInstance.json`) and a list of [assessments](assessment.md) in an `assessments` subdirectory.

```text
exampleCourse
`-- courseInstances
    +-- Fa16                          # Fall 2016 course instance
    |   +-- infoCourseInstance.json   # configuration file (see below)
    |   +-- assessments
    |   |   +-- hw01                  # first homework for Fa16
    |   |   |   `-- ...               # files for Homework 1
    |   |   `-- hw02                  # second homework for Fa16
    |   |       `-- ...               # files for Homework 2
    |   +-- clientFilesCourseInstance
    |   |   `-- Fa16_rules.pdf        # files for Fall 2016
    |   `-- serverFilesCourseInstance
    |       `-- secret2.js            # files only accessible from the server
    `-- Sp17
        +-- infoCourseInstance.json   # Spring 2017 configuration
        +-- assessments
        |   `-- ...                   # Spring 2017 assessments
        +-- clientFilesCourseInstance
        |   `-- ...                   # files for Spring 2017
        `-- serverFilesCourseInstance
            `-- ...                   # files only accessible from the server
```

* See an [example course instances directory](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInstances) in PrairieLearn

* See [clientFiles and serverFiles](clientServerFiles.md) for information on the `clientFilesCourseInstance` and `serverFilesCourseInstance` directories.

## `infoCourseInstance.json`

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

* Example [infoCourseInstance.json](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInstances/Sp15/infoCourseInstance.json)

* [Format specification for `infoCourseInstance.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/infoCourseInstance.json)

## User roles

Each user has a single role assigned to them. These are:

Role         | Description
---          | ---
`Student`    | A student participating in the class. They can only see their own information, and can do do assessments.
`TA`         | A teaching assisstant. They can see the data of all users, but can only edit their own information.
`Instructor` | A person in charge of the course. Has full permission to see and edit the information of other users.

## Course instance `allowAccess`

See [Access control](accessControl.md) for details.

The course instance `allowAccess` rules determine who can access the course instance and when they can do so. Instructors always have access. The simplest case gives everyone access between the start (Jan 19th) and end (May 13th) of the semester, as follows.

```json
    "allowAccess": [
        {
            "startDate": "2015-01-19T00:00:01",
            "endDate": "2015-05-13T23:59:59"
        }
    ]
```


## Timezone

The default timezone for course instances is the timezone of the course. This can be changed with the `timezone` property in `infoCourseInstance.json`. For example:

```json
{
    "timezone": "America/New_York"
}
```

Allowable timezones are those in the TZ column in the [list of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), which is a display version of the [IANA Time Zone Database](https://www.iana.org/time-zones).

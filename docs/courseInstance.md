# Course instance configuration

**NOTE:** Any time you edit or add an `infoCourseInstance.json` file on a local copy of PrairieLearn, you need to click the “Load from disk” button in the page header so that the local PrairieLearn server reloads the changes.

## Directory layout

A _course instance_ corresponds to a single offering of a [course](course/index.md), such as "Fall 2016", or possibly "Fall 2016, Section 1". A course instance like `Fa16` is contained in one directory and has a configuration file (`infoCourseInstance.json`) and a subdirectory (`assessments`) containing a list of [assessments](assessment/index.md). The `assessments` directory should always exist, but may be empty if no assessments have been added. A course instance may be located in the root `courseInstances` directory, or any subfolder that is not a courseInstance itself.

```bash
exampleCourse
`-- courseInstances
    +-- Fa16                          # Fall 2016 course instance
    |   +-- infoCourseInstance.json   # configuration file (see below)
    |   +-- assessments
    |   |   +-- hw01                  # first homework for Fa16
    |   |   |   `-- ...               # files for Homework 1
    |   |   `-- hw02                  # second homework for Fa16
    |   |       `-- ...               # files for Homework 2
    |   +-- clientFilesCourseInstance # (1)!
    |   |   `-- Fa16_rules.pdf        # files for Fall 2016
    `-- Sp17
        +-- infoCourseInstance.json   # Spring 2017 configuration
        +-- assessments
        |   `-- ...                   # Spring 2017 assessments
        +-- clientFilesCourseInstance # (2)!
        |   `-- ...                   # files for Spring 2017
```

1. See [clientFiles and serverFiles](clientServerFiles.md) for information on the `clientFilesCourseInstance` directory.

2. See [clientFiles and serverFiles](clientServerFiles.md) for information on the `clientFilesCourseInstance` directory.

See an [example `courseInstances` directory](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInstances) in the PrairieLearn example course.

## `infoCourseInstance.json`

This file specifies basic information about the course instance:

```json title="infoCourseInstance.json"
{
  "uuid": "62fbe2a4-8c22-471a-98fe-19e5d5da1bbe",
  "longName": "Spring 2015",
  "publishing": {
    "publishDate": "2015-01-19T00:00:01",
    "unpublishDate": "2015-05-13T23:59:59"
  }
}
```

See the [reference for `infoCourseInstance.json`](./schemas/infoCourseInstance.md) for more information about what can be added to this file.

## Publishing controls

The course instance `publishing` configuration determines when the course instance is available to students. Course staff always have access regardless of publishing settings. The simple example below makes the course instance available to students between the start (Jan 19th) and end (May 13th) of the semester:

```json title="infoCourseInstance.json"
{
  "publishing": {
    "publishDate": "2015-01-19T00:00:01",
    "unpublishDate": "2015-05-13T23:59:59"
  }
}
```

Both `publishDate` and `unpublishDate` must be specified together.

### Controlling access by institution

By default, only students that belong to the course's institution can access the course instance. You can use the [`institution` property](./accessControl/index.md#institutions) to allow access from other institutions. For instance, you can use the following rule to allow students from any institution to access the course instance between the specified dates:

```json title="infoCourseInstance.json"
{
  "allowAccess": [
    {
      "startDate": "2015-01-19T00:00:01",
      "endDate": "2015-05-13T23:59:59",
      "institution": "Any"
    }
  ]
}
```

??? note "`allowAccess` rules for course instances"

    `allowAccess` rules for course instances are deprecated. The [ability to configure institutional access](https://github.com/PrairieLearn/PrairieLearn/issues/13043) is a planned feature of self-enrollment controls.

### Controlling access by UID

You can restrict access to particular students by creating a publishing extension through the UI (Course Instance -> Settings -> Publishing -> Extensions).

Previously, you could restrict access to particular students by listing their UIDs in the `uids` property of `allowAccess` rules. This is now deprecated as we move away from storing student information in configuration files.

## Enrollment controls

Students can enroll in a course instance through one of two ways:

1. They can use a URL specific to the course instance or [to one of its assessments](assessment/index.md#linking-to-assessments). You can find the "student link" on the "Settings" tab of the course instance. This link points students to the list of assessments associated to the course instance, enrolling them automatically in the course instance if they are not yet enrolled.

2. They can use the "Add or remove courses" button on PrairieLearn's homepage. This button opens a page listing all course instances that are currently available for enrollment, giving students the option to add new courses.

Some instructors may wish to hide their course from the list of available course instances. This may be done to provide a small level of control over which students get access to the course, or to avoid confusion in case of course instances that are not expected to be visible to students in general. For these instances, the following setting will hide the course instance from the list of instances on the add/remove courses page, even if the instance is available for enrollment.

```json title="infoCourseInstance.json"
{
  "hideInEnrollPage": true
}
```

Note that _this is not a security setting_. Students may still enroll in the course instance if they get access to the URL, such as from a friend. Instructors that wish to actually restrict course enrollment to a specific list of students should instead use an access rule with an explicit list of UIDs, as described under ["Controlling access by UID"](#controlling-access-by-uid).

## Assessment page organization

Instructors can group assessments by course modules (topics, sections, or chapters in a course) or by assessment sets (homeworks, quizzes, exams, and so on). By default, all assessments in a course instance are grouped by `"Set"`. Setting the property `"groupAssessmentsBy"` to `"Module"` will group assessments together by module on the student assessments overview page.

```json title="infoCourseInstance.json"
{
  "groupAssessmentsBy": "Module"
}
```

For more information about assessment modules, see [Course configuration](course/index.md#assessment-modules).

## Timezone

The default timezone for course instances is the timezone of the course. This can be changed with the `timezone` property in `infoCourseInstance.json`. For example:

```json title="infoCourseInstance.json"
{
  "timezone": "America/New_York"
}
```

Allowable timezones are those in the TZ column in the [list of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), which is a display version of the [IANA Time Zone Database](https://www.iana.org/time-zones).

## LTI support

!!! warning

    LTI 1.1 support as described below is deprecated. We recommend using LTI 1.3 for all new course instances. See [the LTI 1.3 documentation](./lmsIntegrationInstructor.md) for more details.

### LTI Overview

LTI, or Learning Tools Interoperability, is the ability for Learning Management Systems (LMSes) to link together. In our context, it means that sites like Coursera can link into assessments in PrairieLearn, give the student a PrairieLearn experience, and report the assessment score back to Coursera automatically.

PrairieLearn LTI support enables a new authentication source (that creates the user in PL and enrolls them in the appropriate course instance) with a grade reporting functionality. Everything else (course instance, assessment and question configuration and workflows) are the same. Assessment [access control](accessControl/index.md) rules still apply for LTI linked assessments.

### Enabling LTI support in a course instance

To point an LMS to use PrairieLearn LTI, you must first create a private LTI credential inside PrairieLearn. These credentials are then configured inside the LMS to connect to PrairieLearn.

To create or manage LTI credentials for a course instance, instructors can visit the **Admin / LTI** page in the course instance.

An LTI credential consists of 3 parts:

- Launch URL - _the URL to configure the LMS to link into PrairieLearn_
- Consumer key - _a unique identifier for the LMS context_
- Shared secret - _a password for the consumer key_

A single LMS course should use the same credential. If multiple courses need to link into the course instance, multiple LTI credentials can be created.

PrairieLearn logins via LTI are unique to their LMS course. For example, if an Illinois student is taking a Coursera LTI course they will have two different user accounts in PrairieLearn.

It is also necessary to add an `accessRule` in `infoCourseInstance.json` with `"institution": "LTI"`. See [Access control](accessControl/index.md) for more details.

### LTI linking into an assessment

LTI supports the concept of "deep linking", such that an assignment link inside the originating LMS can be followed directly into a specific assessment in PrairieLearn. For score reporting back to the LMS, PrairieLearn requires this linking. If a student follows an LTI link from the LMS that has not been configured yet in PrairieLearn, they will receive an error message.

The first time an instructor (in the LMS context) follows a newly created LTI PrairieLearn link, they will be delivered to the **Admin / LTI** page. The LTI link targets section of the page will be populated with the new link information, and the PL course instance's assessments will be listed as a dropdown. These can also be edited at any time from the **Admin / LTI** page.

A course can use the same LTI credential to create multiple links to PrairieLearn, but each link must be configured in PL to an assessment. Multiple links can be created to the same assessment.

### Score reporting back to the LMS (LTI outcomes)

If the LTI link inside the LMS was configured to connect to the LMS gradebook then PrairieLearn scores will also be shown and updated in the LMS. This requires the student to have followed the link from the LMS into PrairieLearn when working on the assessment. LTI does not give PrairieLearn a way to update a score in the LMS gradebook for anything other than a linked assignment. i.e. PrairieLearn can't push other scores into the LMS; the request must originate from the LMS.

Scores are still shown to students and instructors in the normal places in PrairieLearn. The LTI outcomes functionality adds additional reporting back to the originating LMS.

Once the student's assessment instance is linked back to an LMS gradebook entry, any scoring activity on PrairieLearn will be reported back to the LMS. That includes students clicking grade, external grading systems reporting back to PrairieLearn, or instructors manually adjusting grades inside PrairieLearn. These grade updates can happen asynchronously and independently of the student interacting with PrairieLearn.


# Upgrading to PrairieLearn v2

The course directory layout for PLv2 is:

    exampleCourse
    |-- courseInfo.json # needs to be upgraded (see below)
    |-- questions       # does not change in any way
    `-- courseInstances # replaces the 'tests' directory

## Upgrading `courseInfo.json`

FIXME

## Upgrading the `questions` directory

No action is needed for the `questions` directory. All questions will continue to work without modification.

## Upgrading the `tests` directory

The `tests` directory is not used by PLv2. It doesn't matter if it is still present, as PLv2 will just ignore it. The information about tests has now shifted to `courseInstances` (see below).

## The new `courseInstances` directory

There is a new directory at the top level called `courseInstances`. The layout of this is:

    exampleCourse
    `-- courseInstances                    # replaces the 'tests' directory
        +-- Fa16                           # one directory per semester
        |   +-- courseInstanceInfo.json    # settings for Fa16 semester
        |   `-- assessments                # all assessments for the Fa16 semester (equivalent to old tests directory)
        |       +-- hw1
        |       |   `-- info.json
        |       `-- hw2
        |           `-- info.json
        `-- Sp17                           # another semester
            +-- courseInstanceInfo.json
            `-- assessments
                +-- hw1                    # it's ok to reuse assessment names in different semesters
                |   `-- info.json
                `-- hw2
                    `-- info.json

## The `courseInstanceInfo.json` files

See the [`courseInstanceInfo.json` documentation](https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/courseInstanceInfo.md). One of these files is required inside every semester directory.

## The `assessments` directory

The `assessments` directory within each course instance is the equivalent of the old `tests` directory. It contains one subdirectory for each assessment. The word `test` has been replace by `assessment` everywhere within PLv2 to be less confusing (`assessments` includes homeworks, or exams, and everything else).

## The assessment `info.json` files

See [writing assessments](https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/writingAssessments.md) for details on the per-assessment `info.json` files. They are almost the same as the per-test `info.json` files from PLv1, with the following changes:

1. FIXME

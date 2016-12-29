
# Course configuration

## Directory layout

A course is specified by a single directory, with the following structure:

    exampleCourse
    +-- courseInfo.json     # course specification (see below)
    +-- questions           # all questions for the course
    |   `-- ...             # one subdirectory per question
    |-- courseInstances
    |   +-- Fa16            # one directory per semester
    |   |   `-- ...         # configuration and assessments for Fa16
    |   `-- Sp17
    |       `-- ...
    +-- courseClientFiles   # files available from the client at all times
    |   +-- library.js
    |   +-- refs.html
    |   `-- formulas.pdf
    `-- courseServerFiles   # files only accessible from code on the server
        `-- secret1.js

* See an [example course directory](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse) in PrairieLearn

* See [clientFiles and serverFiles](https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/clientServerFiles) for information on the `courseClientFiles` and `courseServerFiles` directories.

## `courseInfo.json`

This file specifies basic information about the course:

```json
{
    "name": "TAM 212",
    "title": "Introductory Dynamics",
    "assessmentSets": [
        {"shortName": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"shortName": "E", "name": "Exam", "heading": "Exams", "color": "red1"}
    ],
    "topics": [
        {"name": "Vectors", "color": "blue3"},
        {"name": "Center of mass", "color": "green3"}
    ],
    "tags": [
        {"name": "drawing", "color": "gray2"},
        {"name": "estimation", "color": "orange2"}
    ]
}
```

* Example [courseInfo.json](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/courseInfo.json)

* [Format specification for `courseInfo.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/courseInfo.json)

## Assessment sets

Each assessment belongs to an `assessmentSet` defined in the `courseInfo.json` file. Each assessment set must have the following properties.

Property | Description
--- | ---
`shortName` | Abbreviation that is joined with the assessment `number` to form the label, so `"shortName": "HW"` produces `HW1`, `HW2`, etc. This should be one or two uppercase letters (e.g., `HW` for homework, `E` for exam, `Q` for quiz).
`name` | Full name that is joined with the assessment `number` to describe the assessment, so `"name": "Homework"` produces `Homework 1`, etc. This should be a singular noun.
`heading` | Title that is listed above all the assessments in the set. Should be the plural version of the `name`.
`color` | The color scheme for this assessment (see below for choices).

## Standardized assessment sets

A list of standardized assessments sets is:

shortName | name | purpose
--- | --- | ---
<button style="border: 0; border-radius: .25em; color: #000; background-color: #8effc1;">HW</button> | Homework | Weekly homeworks done at home.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #8effc1;">MP</button> | Machine Problem | Weekly coding assisgnments done outside of class.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffccbc;">Q</button> | Quiz | Short frequent quizzes.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #fde3a7;">PQ</button> | Practice Quiz | Practice quizzes.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffccbc;">E</button> | Exam | Long-form midterm or final exams.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #fde3a7;">PE</button> | Practice Exam | Practice exams.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #39d5ff;">P</button> | Prep | Temporary assessments used while writing new questions.

Copy the JSON block below to include the above standardized tag names in your course.

```json
    "assessmentSets": [
        {"shortName": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"shortName": "MP", "name": "Machine Problem", "heading": "Machines Problems", "color": "green1"},
        {"shortName": "Q", "name": "Quiz", "heading": "Quizzes", "color": "red1"},
        {"shortName": "PQ", "name": "Practice Quiz", "heading": "Practice Quizzes", "color": "yellow1"},
        {"shortName": "E", "name": "Exam", "heading": "Exams", "color": "red1"},
        {"shortName": "PE", "name": "Practice Exam", "heading": "Practice Exams", "color": "yellow1"},
        {"shortName": "P", "name": "Prep", "heading": "Question Preparation", "color": "blue1"}
    ],
```

## Topics

Each question in the course has a topic from the list specified in the `courseInfo.json` file. Topics should be thought of as chapters or sections in a textbook, and there should be about 10 to 30 topics in a typical course. The topic properties are as follows.

Property | Description
--- | ---
`name` | Brief name for the topic. Shorter is better. Should be in sentence case (leading captial letter).
`color` | The color scheme for this topic (see below for choices).

## Tags

Each question can have zero, one, or many tags associated with it. The properties of a tag are as follows.

Property | Description
--- | ---
`name` | Brief name for the tag. Tags should have very short names (preferably just a single word) because there might be many of them on one question. Should typically be in lower case (e.g., `drawing`) or an uppercase abbreviation (e.g., `MC`).
`color` | The color scheme for this tag (see below for choices).

## Standardized tags names

Tags can be used for a variety of purposes. Some standardized tag names are given below.

Answer format tag | Meaning
--- | ---
<button style="border: 0; border-radius: .25em; color: #000; background-color: #f6c4a3;">numeric</button> | The answer format is one or more numerical values.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #39d5ff;">symbolic</button> | The answer format is a symbolic expression.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #fde3a7;">drawing</button> | The answer format requires drawing on a canvas to input a graphical representation of an answer.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #8effc1;">MC</button> | The answer format is choosing from a small finite set of answers (multiple choice, possibly with multiple selections allowed, up to 10 possible answers).
<button style="border: 0; border-radius: .25em; color: #000; background-color: #5efaf7;">code</button> | The answer format is a piece of code.

Skill testing tag | Meaning
--- | ---
<button style="border: 0; border-radius: .25em; color: #000; background-color: #dcc6e0;">graph</button> | The question tests reading information from a graph or drawing a graph.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffbcd8;">concept</button> | The question tests conceptual understanding of a topic.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffccbc;">compute</button> | The question tests the writing and running of a piece of code to compute the answer. The answer itself is not the code, but could be a numeric answer output by the code, for example (use `code` when the answer is the code).
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffdcb5;">software</button> | The question tests the use of a specific piece of software (e.g., Matlab).
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #ff6c5c;">estimation</button> | Answering the question correctly will require some amount of estimation, so an exact answer is not possible.

Question use tag | Meaning
--- | ---
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #c72c1c;">secret</button> | Only use this question on exams or quizzes that won't be released to students, so the question can be kept secret.
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #008c31;">nontest</button> | This question is not appropriate for use in a restricted testing environment, so only use it on homeworks or similar.

Tracking tag | Meaning
--- | ---
<button style="border: 0; border-radius: .25em; color: #000; background-color: #e0e0e0;">course</button> | The course for which the question was originally written. E.g., `TAM212`, `CS233`.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #e0e0e0;">NetID</button> | The NetID of the person who wrote the question, E.g., `mwest`, `zilles`, etc. Multiple NetIDs can be tagged when several people had significant input.
<button style="border: 0; border-radius: .25em; color: #000; background-color: #e0e0e0;">semester</button> | The semester when the question was written. E.g., `Sp15`, `Su16`, `Fa16`.

Copy the JSON block below to include the above standardized tag names in your course.

```json
    "tags": [
        {"name": "numeric", "color": "brown1"},
        {"name": "symbolic", "color": "blue1"},
        {"name": "drawing", "color": "yellow1"},
        {"name": "MC", "color": "green1"},
        {"name": "code", "color": "turquoise1"},
        {"name": "graph", "color": "purple1"},
        {"name": "concept", "color": "pink1"},
        {"name": "compute", "color": "red1"},
        {"name": "software", "color": "orange1"},
        {"name": "estimation", "color": "red2"},
        {"name": "secret", "color": "red3"},
        {"name": "nontest", "color": "green3"},
        {"name": "Sp15", "color": "gray1"},
        {"name": "Su15", "color": "gray1"},
        {"name": "Fa15", "color": "gray1"},
        {"name": "Sp16", "color": "gray1"},
        {"name": "Su16", "color": "gray1"},
        {"name": "Fa16", "color": "gray1"},
        {"name": "Sp17", "color": "gray1"},
        {"name": "Su17", "color": "gray1"},
        {"name": "Fa17", "color": "gray1"},
        {"name": "insert your course name", "color": "gray1"},
        {"name": "insert your NetID", "color": "gray1"}
    ]
```

## Colors

The possible colors for assessment sets, topic, and tags are:

<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffccbc;">red1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #ff6c5c;">red2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #c72c1c;">red3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffbcd8;">pink1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #fa5c98;">pink2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #ba1c58;">pink3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #dcc6e0;">purple1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #9b59b6;">purple2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #5e147d;">purple3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #39d5ff;">blue1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #1297e0;">blue2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #0057a0;">blue3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #5efaf7;">turquoise1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #27cbc0;">turquoise2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #008b80;">turquoise3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #8effc1;">green1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #2ecc71;">green2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #008c31;">green3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #fde3a7;">yellow1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #f5ab35;">yellow2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #d87400;">yellow3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #ffdcb5;">orange1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #ff926b;">orange2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #c3522b;">orange3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #f6c4a3;">brown1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #ce9c7b;">brown2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #8e5c3b;">brown3</button>
</div>
<div>
<button style="border: 0; border-radius: .25em; color: #000; background-color: #e0e0e0;">gray1</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #909090;">gray2</button>
<button style="border: 0; border-radius: .25em; color: #fff; background-color: #505050;">gray3</button>
</div>

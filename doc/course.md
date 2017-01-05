
# Course configuration

## Directory layout

A course is specified by a single directory, with the following structure:

```
exampleCourse
+-- courseInfo.json     # course specification (see below)
+-- questions           # all questions for the course
|   `-- ...             # one subdirectory per question
+-- courseInstances
|   +-- Fa16            # one directory per semester
|   |   `-- ...         # configuration and assessments for Fa16
|   `-- Sp17
|       `-- ...
+-- clientFilesCourse   # files available from the client at all times
|   +-- library.js
|   +-- refs.html
|   `-- formulas.pdf
`-- serverFilesCourse   # files only accessible from code on the server
    `-- secret1.js
```

* See an [example course directory](../exampleCourse) in PrairieLearn

* See [clientFiles and serverFiles](clientServerFiles.md) for information on the `clientFilesCourse` and `serverFilesCourse` directories.

## `courseInfo.json`

This file specifies basic information about the course:

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "name": "TAM 212",
    "title": "Introductory Dynamics",
    "assessmentSets": [
        {"abbreviation": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"abbreviation": "E", "name": "Exam", "heading": "Exams", "color": "red1"}
    ],
    "topics": [
        {"name": "Vectors", "color": "blue3", "description": "Vector algebra in 3D"},
        {"name": "Center of mass", "color": "green3", "description": "Finding and using the center of mass of irregular bodies."}
    ],
    "tags": [
        {"name": "drawing", "color": "gray2", "description": "The answer requires drawing."},
        {"name": "estimation", "color": "orange2", "description": "Answering requires estimating a quantity."}
    ]
}
```

* Example [courseInfo.json](../exampleCourse/courseInfo.json)

* [Format specification for `courseInfo.json`](../schemas/courseInfo.json)

## Assessment sets

Each assessment belongs to an `assessmentSet` defined in the `courseInfo.json` file. Each assessment set must have the following properties.

Property | Description
--- | ---
`abbreviation` | Abbreviation that is joined with the assessment `number` to form the label, so `"abbreviation": "HW"` produces `HW1`, `HW2`, etc. This should be one or two uppercase letters (e.g., `HW` for homework, `E` for exam, `Q` for quiz).
`name` | Full name that is joined with the assessment `number` to describe the assessment, so `"name": "Homework"` produces `Homework 1`, etc. This should be a singular noun.
`heading` | Title that is listed above all the assessments in the set. Should be the plural version of the `name`.
`color` | The color scheme for this assessment (see below for choices).

## Standardized assessment sets

A list of standardized assessments sets is:

abbreviation | name | purpose
--- | --- | ---
`HW` | Homework | Weekly homeworks done at home.
`MP` | Machine Problem | Weekly coding assisgnments done outside of class.
`Q` | Quiz | Short frequent quizzes.
`PQ` | Practice Quiz | Practice quizzes.
`E` | Exam | Long-form midterm or final exams.
`PE` | Practice Exam | Practice exams.
`P` | Prep | Temporary assessments used while writing new questions.

Copy the JSON block below to include the above standardized tag names in your course.

```json
    "assessmentSets": [
        {"abbreviation": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"abbreviation": "MP", "name": "Machine Problem", "heading": "Machines Problems", "color": "green1"},
        {"abbreviation": "Q", "name": "Quiz", "heading": "Quizzes", "color": "red1"},
        {"abbreviation": "PQ", "name": "Practice Quiz", "heading": "Practice Quizzes", "color": "yellow1"},
        {"abbreviation": "E", "name": "Exam", "heading": "Exams", "color": "red1"},
        {"abbreviation": "PE", "name": "Practice Exam", "heading": "Practice Exams", "color": "yellow1"},
        {"abbreviation": "P", "name": "Prep", "heading": "Question Preparation", "color": "blue1"}
    ],
```

## Topics

Each question in the course has a topic from the list specified in the `courseInfo.json` file. Topics should be thought of as chapters or sections in a textbook, and there should be about 10 to 30 topics in a typical course. The topic properties are as follows.

Property | Description
--- | ---
`name` | Brief name for the topic. Shorter is better. Should be in sentence case (leading captial letter).
`color` | The color scheme for this topic (see below for choices).
`description` | An explanation of what the topic includes, for human referance.

## Tags

Each question can have zero, one, or many tags associated with it. The properties of a tag are as follows.

Property | Description
--- | ---
`name` | Brief name for the tag. Tags should have very short names (preferably just a single word) because there might be many of them on one question. Should typically be in lower case (e.g., `drawing`) or an uppercase abbreviation (e.g., `MC`).
`color` | The color scheme for this tag (see below for choices).
`description` | An explanation of what the tag means, for human referance.

## Standardized tag names

Tags can be used for a variety of purposes. Some standardized tag names are given below.

Answer format tag | Meaning
--- | ---
`numeric` | The answer format is one or more numerical values.
`symbolic` | The answer format is a symbolic expression.
`drawing` | The answer format requires drawing on a canvas to input a graphical representation of an answer.
`MC` | The answer format is choosing from a small finite set of answers (multiple choice, possibly with multiple selections allowed, up to 10 possible answers).
`code` | The answer format is a piece of code.
`multianswer` | The question requires multiple answers, either as steps in a sequence or as separate questions.

Skill testing tag | Meaning
--- | ---
`graph` | The question tests reading information from a graph or drawing a graph.
`concept` | The question tests conceptual understanding of a topic.
`calculate` | The questions tests performing a numerical calculation, with either a calculator or equivalent software.
`compute` | The question tests the writing and running of a piece of code to compute the answer. The answer itself is not the code, but could be a numeric answer output by the code, for example (use `code` when the answer is the code).
`software` | The question tests the use of a specific piece of software (e.g., Matlab).
`estimation` | Answering the question correctly will require some amount of estimation, so an exact answer is not possible.

Question use tag | Meaning
--- | ---
`secret` | Only use this question on exams or quizzes that won't be released to students, so the question can be kept secret.
`nontest` | This question is not appropriate for use in a restricted testing environment, so only use it on homeworks or similar.

Tracking tag | Meaning
--- | ---
`<course>` | The course for which the question was originally written. E.g., `TAM212`, `CS233`.
`<email>` | The email of the person who wrote the question, E.g., `mwest@illinois.edu`. Multiple emails can be tagged when several people had significant input.
`<semester>` | The semester when the question was written. E.g., `Sp15`, `Su16`, `Fa16`.

Copy the JSON block below to include the above standardized tag names in your course.

```json
    "tags": [
        {"name": "numeric", "color": "brown1"},
        {"name": "symbolic", "color": "blue1"},
        {"name": "drawing", "color": "yellow1"},
        {"name": "MC", "color": "green1"},
        {"name": "code", "color": "turquoise1"},
        {"name": "multianswer", "color": "orange2"},
        {"name": "graph", "color": "purple1"},
        {"name": "concept", "color": "pink1"},
        {"name": "calculate", "color": "green2"},
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

<img width="1890" src="colors.png" />

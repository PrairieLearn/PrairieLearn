# How do I create my own assessment set?

[//]: # (This section was copied from course.md - "Course Configuration".  Delete from there?)
## Assessment sets
Each assessment belongs to an *assessment set*. Each assessment set must have the following properties.

Property | Description
--- | ---
`abbreviation` | Abbreviation that is joined with the assessment `number` to form the label, so `"abbreviation": "HW"` produces `HW1`, `HW2`, etc. This should be one or two uppercase letters (e.g., `HW` for homework, `E` for exam, `Q` for quiz).
`name` | Full name that is joined with the assessment `number` to describe the assessment, so `"name": "Homework"` produces `Homework 1`, etc. This should be a singular noun.
`heading` | Title that is listed above all the assessments in the set. Should be the plural version of the `name`.
`color` | The color scheme for this assessment (see below for choices)


[//]: # (This section was copied from course.md - "Course Configuration".  Delete from there?)
## Standardized assessment sets
The following list of standardized assessments sets is automatically included in every course. You do not need to include these in your JSON file, but you can add extra assessment sets if needed (see below).

abbreviation | name | purpose
--- | --- | ---
`HW` | Homework | Weekly homeworks done at home.
`MP` | Machine Problem | Weekly coding assisgnments done outside of class.
`Q` | Quiz | Short frequent quizzes.
`PQ` | Practice Quiz | Practice quizzes.
`E` | Exam | Long-form midterm or final exams.
`PE` | Practice Exam | Practice exams.
`P` | Prep | Temporary assessments used while writing new questions.
`WS` | Worksheet | Guided activity, often completed in groups.


[//]: # (This section was copied from course.md - "Course Configuration".  Delete from there?)
## Adding your own assessment sets

You can add more assessment sets by listing them in the `infoCourse.json` file as follows. Note that HW and Q don't need to be listed because they are automatically available as standardized sets (see above).

```json
    "assessmentSets": [
        {"abbreviation": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"abbreviation": "Q", "name": "Quiz", "heading": "Quizzes", "color": "red1"}
    ],
```

The assessment set order in `infoCourse.json` is the order in which the assessments will be shown within PrairieLearn (for both instructors and students). If you want to change the order of standardized assessment sets then you can re-list them in whatever order you like. For example, to put Exams and Quizzes first, you could use:

```json
    "assessmentSets": [
        {'abbreviation': 'E', 'name': 'Exam', 'heading': 'Exams', 'color': 'brown1'},
        {'abbreviation': 'Q', 'name': 'Quiz', 'heading': 'Quizzes', 'color': 'red1'},
        {'abbreviation': 'PE', 'name': 'Practice Exam', 'heading': 'Practice Exams', 'color': 'yellow1'},
        {'abbreviation': 'PQ', 'name': 'Practice Quiz', 'heading': 'Practice Quizzes', 'color': 'pink1'},
        {'abbreviation': 'HW', 'name': 'Homework', 'heading': 'Homeworks', 'color': 'green1'},
        {'abbreviation': 'P', 'name': 'Prep', 'heading': 'Question Preparation', 'color': 'gray1'},
        {'abbreviation': 'MP', 'name': 'Machine Problem', 'heading': 'Machine Problems', 'color': 'turquoise1'},
        {'abbreviation': 'WS', 'name': 'Worksheet', 'heading': 'Worksheets', 'color': 'purple1'}
    ],
```


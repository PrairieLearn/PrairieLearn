# How do I create my own assessment set or change existing ones?

[//]: # (A lot of this content was copied from course.md - "Course Configuration".  Delete from there?)


Each assessment belongs to an *assessment set*; these organize assessments into different categories, such as "Homework", "Exam", etc.   Prairielearn has a list of standardized assessment sets that are sufficient for many purposes, but instructors are able to create their own assessment sets as well.

## Standardized assessment sets

The following list of standardized assessments sets is automatically included in every course. 

name | purpose
--- | ---
Homework | Weekly homeworks done at home.
Machine Problem | Weekly coding assisgnments done outside of class.
Quiz | Short frequent quizzes.
Practice Quiz | Practice quizzes.
Exam | Long-form midterm or final exams.
Practice Exam | Practice exams.
Prep | Temporary assessments used while writing new questions.
Worksheet | Guided activity, often completed in groups.


## Assessment set properties
Each assessment set is characterized by the following properties.

Property | Description
--- | ---
`name` | Full name that is joined with the assessment `number` to describe the assessment, so `"name": "Homework"` produces `Homework 1`, etc. This should be a singular noun.
`abbreviation` | Abbreviation that is joined with the assessment `number` to form the label, so `"abbreviation": "HW"` produces `HW1`, `HW2`, etc. This should be one or two uppercase letters (e.g., `HW` for homework, `E` for exam, `Q` for quiz).
`heading` | Title that is listed above all the assessments in the set. Should be the plural version of the `name`.
`color` | The color scheme for this assessment (see below for choices)

The standardized assessment sets' properties are as follows.

name | abbreviation | heading | color
--- | --- | --- | ---
Homework | `HW` | Homeworks | green1
Machine Problem | `MP` | Machine Problems | turqoise1
Quiz | `Q` | Quizzes | red1
Practice Quiz | `PQ` | Practice Quizzes | pink1
Exam | `E` | Exams | brown1
Practice Exam | `PE` | Practice Exams | yellow1
Prep | `P` | Question Preparation | gray1
Worksheet | `WS` | Worksheets | purple1



## Adding your own assessment sets

To add an assessment set that does not belong to the standardized collection, navigate to the main page of your course by selecting its name from the drop-down menu in the upper left corner.

* Navigate to the `Settings` tab and click the `Edit` button next to `infoCourse.json`.

* Add a property called `assessmentSets` and provide the four required properties listed above.  For example:
```json
    "assessmentSets": [
        {"abbreviation": "PR", "name": "Project", "heading": "Projects", "color": "pink2"},
        {"abbreviation": "IC", "name": "In-Class", "heading": "In-Class Examples", "color": "yellow3"}
    ],
```

You do not need to add the standardized assessment sets to `infoCourse.json`; they will remain available in your course.

## Editing standardized assessment sets

The assessment set order in `infoCourse.json` is the order in which the assessments will be shown within PrairieLearn (for both instructors and students). If you want to change the order of standardized assessment sets then you can re-list them in whatever order you like. For example, to put Exams and Quizzes first, you could enter the following into the `infoCourse.json`:

```json
    "assessmentSets": [
        {"abbreviation": "E", "name": "Exam", "heading": "Exams", "color": "brown1"},
        {"abbreviation": "Q", "name": "Quiz", "heading": "Quizzes", "color": "red1"},
        {"abbreviation": "PE", "name": "Practice Exam", "heading": "Practice Exams", "color": "yellow1"},
        {"abbreviation": "PQ", "name": "Practice Quiz", "heading": "Practice Quizzes", "color": "pink1"},
        {"abbreviation": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"},
        {"abbreviation": "P", "name": "Prep", "heading": "Question Preparation", "color": "gray1"},
        {"abbreviation": "MP", "name": "Machine Problem", "heading": "Machine Problems", "color": "turquoise1"},
        {"abbreviation": "WS", "name": "Worksheet", "heading": "Worksheets", "color": "purple1"}
    ],
```

You can also change the headings, abbreviations, etc. if so desired.  Of course, you can add in your own assessment sets at the same time, in the order in which you want them to appear.  

## Colors

The possible colors for assessment sets are the following: 

![Colors](colors.png)

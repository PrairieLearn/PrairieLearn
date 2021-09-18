# How to create new assessment sets

Each assessment belongs to an *assessment set*, which organize the assessments into different categories, such as "Homework", "Exam", etc.   PrairieLearn has a list of [standardized assessment sets](../references/course.md#assessment-sets) that are sufficient for many purposes, but instructors are able to create their own assessment sets as well.

* Go to the main course page, by clicking your course name on the top bar menu.

* Go to the `Files` tab.

* Click the `Edit` button next to the file `infoCourse.json`

* Add the desired assessment set to the  `assessmentSets` property:

```json
"assessmentSets": [
    {"abbreviation": "PR", "name": "Project", "heading": "Projects", "color": "pink2"}
],
```

You do not need to add the standardized assessment sets to `infoCourse.json`; they will remain available in your course.

Note that the assessment set order in `infoCourse.json` is the order in which the assessments will be shown within PrairieLearn (for both instructors and students). If you want to change the order of the standardized assessment sets, then you can re-list the ones you use in whatever order you like. For example, if you want to want "Exams" appearing first, and then "Projects", followed by "Homework", you can define the  `assessmentSets` property as:

```json
"assessmentSets": [
    {"abbreviation": "E", "name": "Exam", "heading": "Exams", "color": "brown1"},
    {"abbreviation": "PR", "name": "Project", "heading": "Projects", "color": "pink2"}
    {"abbreviation": "HW", "name": "Homework", "heading": "Homeworks", "color": "green1"}
],
```

You can also change the headings, abbreviations, etc. if so desired. The possible colors for assessment sets are described [here]((../references/course.md#colors))

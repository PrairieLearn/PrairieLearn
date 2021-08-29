# Course staff

Access permissions for course staff can be configured on the "Staff" tab. Course staff permissions are separated into *course content roles* and *student data roles*. These can be mixed and matched arbitrarily, so any combination is possible.

## Course content access roles

Course content access roles grant permission to access all course content, such as questions and assessments, including aggregate statistics from student usage.

Action                                            | None | Previewer | Viewer | Editor | Owner
:-------------------------------------------------|:----:|:---------:|:------:|:------:|:-----:
View questions and assessments                    |  ⋅   |     ✓     |   ✓    |   ✓    |   ✓
View issues                                       |  ⋅   |     ✓     |   ✓    |   ✓    |   ✓
View aggregate statistics in all course instances |  ⋅   |     ✓     |   ✓    |   ✓    |   ✓
View question code and JSON files                 |  ⋅   |     ⋅     |   ✓    |   ✓    |   ✓
Close issues                                      |  ⋅   |     ⋅     |   ⋅    |   ✓    |   ✓
Edit question code and JSON files                 |  ⋅   |     ⋅     |   ⋅    |   ✓    |   ✓
Sync from GitHub                                  |  ⋅   |     ⋅     |   ⋅    |   ✓    |   ✓
Edit course staff permissions                     |  ⋅   |     ⋅     |   ⋅    |   ⋅    |   ✓

## Student data access roles

Student data access roles grant permission to access to individual student data.

Action                                   | None | Viewer | Editor
:----------------------------------------|:----:|:------:|:------:
View individual student scores           |  ⋅   |   ✓    |   ✓
Download gradebook data                  |  ⋅   |   ✓    |   ✓
Manually grade student submissions       |  ⋅   |   ⋅    |   ✓
Edit individual student scores           |  ⋅   |   ⋅    |   ✓
Change time limits and close assessments |  ⋅   |   ⋅    |   ✓

## Recommended course staff roles

While every course should use the different roles in a way that best suits the course needs, some recommended guidelines are:

Role                                 | Course content access | Student data access
:------------------------------------|:---------------------:|:-------------------:
Instructor                           | Course content owner  | Student data editor
TAs developing course content        | Course content editor | Student data editor
Student content developers (not TAs) | Course content editor | None
TAs involved in grading              | None                  | Student data editor
Other TAs                            | None                  | Student data viewer
Instructors from other classes       | Course content viewer | None

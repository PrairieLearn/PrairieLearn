# `clientFiles` and `serverFiles`

There are multiple locations within each course where files can be stored for access from the client or server. These can be used for code libraries used in questions, images embedded within questions, formula sheets available during exams, or online textbooks for reference during exams.

`ClientFiles` directories contain files that are accessible from the client web browser. This is appropriate for code libraries used on the client, or for files that a student should have access to, such as an image, reference webpages, or formula sheets.

`ServerFiles` directories are only accessible from code running on the server, so are useful for libraries that can solve questions or generate random question instances. Files in a `serverFiles` directory cannot be directly accessed by the student's web browser.

## Directory layout

A `clientFiles*` subdirectory can be associated with the course, a question, a course instance, or an assessment, as shown below. The `serverFilesCourse` subdirectory is associated with the course as a whole.

```text
exampleCourse
+-- clientFilesCourse                     # client files for the entire course
|   +-- library.js
+-- serverFilesCourse                     # server files for the entire course
|   `-- secret1.js
+-- questions
|   `-- fossilFuels
|       +-- clientFilesQuestion           # client files for the fossilFuels question
|       |   `-- power-station.jpg
`-- courseInstances
    `-- Fa16
       +-- clientFilesCourseInstance      # client files for the Fall 2016 course instance
       |   `-- Fa16_rules.pdf
       `-- assessments
           `-- hw01
               `-- clientFilesAssessment  # client files for the Homework 1 assessment
                   `-- formulaSheet.pdf
```

## Access control

Each different `clientFiles*` directory is accessible under the same [access control rules](accessControl.md) for the course instances and assessments. That is, `clientFilesCourse` is accessible to any student who has access to some course instance, while `clientFilesQuestion`, `clientFilesCourseInstance`, and `clientFilesAssessment` are accessible to students with access to the corresponding question, course instance, or assessment.

## Accessing files from HTML templates

From within HTML, `clientFiles` directories can be templated with the following `mustache` patterns:

```text
{{ options.client_files_course_url }}/filename.ext
{{ options.client_files_question_url }}/filename.ext
```

## Accessing files from `server.py` question code

See the [accessing files on disk](question.md#accessing-files-on-disk) section for details.

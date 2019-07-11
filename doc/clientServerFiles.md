
# `clientFiles` and `serverFiles`

There are multiple locations within each course where files can be stored for access from the client or server. These can be used for code libraries used in questions, images embedded within questions, formula sheets available during exams, or online textbooks for reference during exams.

`ClientFiles` directories contain files that are accessible from the client webbrowser. This is appropriate for code libraries used on the client, or for files that a student should have access to, such as an image, reference webpages, or formula sheets.

`ServerFiles` directories are only accessible from code running on the server, so are useful for libraries that can solve questions or generate random question instances. Files in a `serverFiles` directory cannot be directly accessed by the student's webbrowser.

## Directory layout

The `clientFiles` and `serverFiles` subdirectories can be associated with the course, a question, a course instance, or an assessment, as shown below.

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
|       `-- serverFilesQuestion           # server files for the fossilFuels question
|           `-- 
`-- courseInstances
    `-- Fa16
       +-- clientFilesCourseInstance      # client files for the Fall 2016 course instance
       |   `-- Fa16_rules.pdf
       +-- serverFilesCourseInstance
       |   `-- secret2.js                 # server files for the Fall 2016 course instance
       `-- assessments
           `-- hw01
               `-- clientFilesAssessment  # client files for the Homework 1 assessment
                   `-- formulaSheet.pdf
               `-- serverFilesAssessment  # server for the Homework 1 assessment
                   `-- ...
```

## Access control

Each different `clientFiles` or `serverFiles` directory is accessible under the same [access control rules](accessControl.md) for the course instances and assessments. That is, `clientFilesCourse` is accessible to any student who has access to some course instance, while `clientFilesQuestion`, `clientFilesCourseInstance`, and `clientFilesAssessment` are accessible to students with access to the corresponding question, course instance, or assessment.

## Accessing files from HTML templates

From within HTML, `clientFiles` directories can be templated with the following `mustache` patterns:

```text
{{ options.client_files_course_url }}/filename.ext
{{ options.client_files_question_url }}/filename.ext
```

## Accessing files from code via RequireJS

These library files are separated into *client* and *server* libraries. Client libraries are accessible from both `client.js` and `server.js` in each question, while server libraries are only accessible from `server.js`. This means that any secret code that students should not be able to access can be put in a server library, while other non-sensitive code can go in client libraries. There is never a need to put a library file into both the client and server directories, because it can just go only into the client directory and be accessed directly from there by both `client.js` and `server.js`.

The basic form of a `library.js` file is:

```javascript
define([<DEPENDENT-LIBRARIES-PATHS>], function(<DEPENDENT-LIBRARY-VARS>) {

    var library = {};

    library.add = function(arg1, arg2) {
        return arg1 + arg2;
    };

    // more library functions go here

    return library;
});
```

To use this `library.js` file inside a question's `client.js` or `server.js` file:

```javascript
define([<OTHER-LIBRARY-PATHS>, 'clientCode/library'], function(<OTHER-LIBRARY-VARS>, library) {

    var sum = library.add(3, 5); // sets sum to 8

});
```


## Deprecated access modes

To support old code, `clientFilesCourse` is also accessible as `clientFiles` and `clientCode`, while `serverFilesCourse` is accessible as `serverCode`.

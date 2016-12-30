
# `clientFiles` and `serverFiles`

There are multiple locations within each course where files can be stored from access from the client or server. These can be used for code libraries used in questions, formula sheets available during exams, or online textbooks for reference during exams.

`ClientFiles` directories contain files that are accessible from the client webbrowser. This is appropriate for code libraries used on the client, or for files that a student should have access to, such as reference webpages or formula sheets.

`ServerFiles` directories are only accessible from code runningn on the server, so are useful for libraries that can solve questions or generate random question instances. Files in a `serverFiles` directory cannot be directly accessed by the student's webbrowser.

## Directory layout

The `clientFiles` and `serverFiles` subdirectories can be associated with the course, a course instance, or an assessment, as shown below.

```
exampleCourse
+-- courseClientFiles                     # client files for the entire course
|   +-- library.js
+-- courseServerFiles                     # server files for the entire course
|   `-- secret1.js
`-- courseInstances
    `-- Fa16
       +-- courseInstanceClientFiles      # client files for the Fall 2016 course instance
       |   `-- Fa16_rules.pdf
       +-- courseInstanceServerFiles
       |   `-- secret2.js                 # server files for the Fall 2016 course instance
       `-- assessments
           `-- hw01
               `-- assessmentClientFiles  # client files for the Homework 1 assessment
                   `-- formulaSheet.pdf
               `-- assessmentServerFiles  # server for the Homework 1 assessment
                   `-- ...
```

## Access control

Each different `clientFiles` or `serverFiles` directory is accessible under the same [access control rules](accessControl.md) for the course instances and assessments. That is, `courseClientFiles` is accessible to any student who has access to some course instance, while `courseInstanceClientFiles` and `assessmentClientFiles` are accessible to students with access to the corresponding course instance or assessment.

## Accessing files from assessments

## Accessing files from questions



Each course can have JavaScript libraries that are specific to just that course, and can be used from any question in the course. See the (course configuration)[https://github.com/PrairieLearn/PrairieLearn/blob/master/doc/courseConfig.md] section for the directory layout.

These library files are separated into *client* and *server* libraries. Client libraries are accessible from both `client.js` and `server.js` in each question, while server libraries are only accessible from `server.js`. This means that any secret code that students should not be able to access can be put in a server library, while other non-sensitive code can go in client libraries. There is never a need to put a library file into both the client and server directories, because it can just go only into the client directory and be accessed directly from there by both `client.js` and `server.js`.

The basic form of a `library.js` file is:

    define([<DEPENDENT-LIBRARIES-PATHS>], function(<DEPENDENT-LIBRARY-VARS>) {
    
        var library = {};
    
        library.add = function(arg1, arg2) {
            return arg1 + arg2;
        };

        // more library functions go here

        return library;
    });

To use this `library.js` file inside a question's `client.js` or 'server.js` file:

    define([<OTHER-LIBRARY-PATHS>, 'clientCode/library'], function(<OTHER-LIBRARY-VARS>, library) {
    
        var sum = library.add(3, 5); // sets sum to 8
    
    });


## Deprecated access modes

To support old code, `courseClientFiles` is also accessible as `clientFiles` and `clientCode`, while `courseServerFiles` is accessible as `serverCode`.

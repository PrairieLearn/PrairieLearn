
# Writing questions in PrairieLearn

**NOTE:** Any time you edit or add a question, you need to stop and restart the PrairieLearn server for it to reload the changes.

Questions are all stored inside the main `questions` directory for a course. Each question is a single directory that contains all the files for that question. The name of the question directory is the question ID label (the `qid`) for that question. For example, here are two different questions:

    questions
    |
    |-- fossilFuelsRadio  # first question, qid is "fossilFuelsRadio"
    |   |
    |   |-- info.json     # metadata for the fossilFuelsRadio question
    |   |-- server.js     # secret server-side code (does grading, etc)
    |   `-- client.js     # client-side code (runs in the student's browser)
    |
    `-- addVectors        # second question, qid is "addVectors"
        |
        |-- info.json     # files for the addVectors question
        |-- server.js
        |-- client.js
        |-- question.html
        |-- answer.html
        |-- fig1.png      # extra files (e.g., images) for the question
        `-- notes.docx    # more files, like notes on how the question works

PrairieLearn assumes independent questions; nothing ties them together. However, each question could have multiple parts (inputs that are validated together).

Example questions are in the [`exampleCourse/questions`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions) directory inside PrairieLearn.


## Question `info.json`

The `info.json` file for each question defines properties of the question. For example, for the `addVectors` question:

    {
        "title": "Addition of vectors in Cartesian coordinates",
        "topic": "Vectors",
        "tags": ["Cartesian", "graphical"],
        "clientFiles": ["client.js", "question.html", "answer.html", "fig1.png"],
        "type": "Calculation"
    }

- `title` gives a student-visible title for the question.
- `topic` is the part of the course that this question belongs to (like the chapter in a textbook).
- `tags` (optional) stores any other aspects of the questions, for sorting and searching (these can be anything).
- `clientFiles` (optional) lists the files that the client (student's webbrowser) can access. Anything in here should be considered viewable by the student.
- `type` specifies the question format.

Type             | Example                                                                                                       | Required Files                              | Options format                                                                                                                                                          | Description
---              | ---                                                                                                           | ---                                         | ---                                                                                                                                                                     | ---
`MultipleChoice` | [`fossilFuelsRadio`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/fossilFuelsRadio) | `info.json`                                 | [`MultipleChoice` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/questionOptionsMultipleChoice.json)                                 | A multiple choice question (radio button). One correct answer and several incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized.
`MultipleTrueFalse` | [`fossilFuelsTrueFalse`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/fossilFuelsTrueFalse) | `info.json`                                 | [`MultipleTrueFalse` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/questionOptionsMultipleTrueFalse.json)                                 | A multiple choice question (radio button). One correct answer and several incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized.
`Checkbox`       | [`fossilFuelsCheckbox`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/fossilFuelsCheckbox) | `info.json`                                 | [`Checkbox` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/questionOptionsCheckbox.json)                                 | A multiple choice question (checkbox). Multiple correct and incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized.
`File`           | [`fibonacci`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/fibonacci)     | `info.json`, `question.html`, `answer.html` |  [`File` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/questionOptionsFile.json)                                                    | A file is provided to the student for download, and they have to upload an edited file for grading.
`Calculation`    | [`addVectors`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions/addVectors)   | `info.json`, `client.js`, `server.js`       | [`Calculation` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/questionOptionsCalculation.json)                                       | A very general question type that allows server-side and client-side code to generate and grade questions.


## `MultipleChoice` questions

A `MultipleChoice` question has an `info.json` that provides the question text, one or more correct answers, and one or more incorrect answers. One correct answer is randomly chosen, and enough incorrect answers to make `numberAnswers` total answers, which are then displayed to the student in a random order. For example:

    {
        "title": "Advantages of fossil fuels (radio)",
        "topic": "Energy",
        "tags": ["comparative advantages", "fossil fuels", "renewables"],
        "type": "MultipleChoice",
        "options": {
            "text": "Which of the following is an advantage of fossil fuels relative to renewable energy sources?",
            "correctAnswers": [
                "Cheap",
                "High energy density",
                "Provide energy on demand"            
            ],
            "incorrectAnswers": [
                "Non-polluting",
                "Low energy density",
                "Low production of carbon dioxide",
                "High production of carbon dioxide",
                "Secure",
                "Sustainable",
                "Low energy return"
            ],
            "numberAnswers": 5
        }
    }


## `MultipleTrueFalse` questions

A `MultipleTrueFalse` question has an `info.json` that provides the question text, zero or more true statements, and zero or more false statements. All the given statements are used, and are displayed to the students in a random order. For example:

{
    "title": "Advantages of fossil fuels (MTF)",
    "topic": "Energy",
    "tags": ["comparative advantages", "fossil fuels", "renewables"],
    "type": "MultipleTrueFalse",
    "options": {
      "text": "For each of the following statements, select whether it is true or false.",
      "trueStatements": [
          "Cheapness is an advantage of fossil fuels relative to renewable energy sources."
      ],
      "falseStatements": [
          "This is a false statement",
          "This is another false statement",
          "Frugalness is an advantage of fossil fuels relative to renewable energy sources for its frugality and other various conditions that are consequences of frugality."
      ],
      "correctScore": 1,
      "incorrectScore": 0,
      "guessingPenalty": -1
    }
}


## `Checkbox` questions

A `Checkbox` question has an `info.json` that provides the question text, one or more correct answers, and one or more incorrect answers. Several correct answers are randomly chosen (between `minCorrectAnswers` and `maxCorrectAnswers`, inclusive), and enough incorrect answers to make `numberAnswers` total answers, which are then displayed to the student in a random order. Depending on the values of `minCorrectAnswers` and `maxCorrectAnswers` it is possible to have all or none of the possible answers be correct. For example:

    {
        "title": "Advantages of fossil fuels (checkbox)",
        "topic": "Energy",
        "tags": ["comparative advantages", "fossil fuels", "renewables"],
        "type": "Checkbox",
        "options": {
            "text": "Which of the following are advantages of fossil fuels relative to renewable energy sources? Select all that apply.",
            "correctAnswers": [
                "Cheap",
                "High energy density",
                "Provide energy on demand"            
            ],
            "incorrectAnswers": [
                "Non-polluting",
                "Low energy density",
                "Low production of carbon dioxide",
                "High production of carbon dioxide",
                "Secure",
                "Sustainable",
                "Low energy return"
            ],
            "numberAnswers": 5,
            "minCorrectAnswers": 1,
            "maxCorrectAnswers": 3
        }
    }


## `File` questions

A `File` question gives the student a file to download, and then requires an uploaded file for the answer. The downloaded file is specified in the `info.json` like:

    {
        "title": "Write a Fibonacci function",
        "topic": "Functions",
        "tags": ["recursion"],
        "clientFiles": ["client.js", "question.html", "answer.html", "fib.py"],
        "type": "File",
        "options": {
            "fileName": "fib.py"
        }
    }


## `Calculation` questions

A `Calculation` question is the most general type of question, allowing arbitrary code to generate and grade the question instance on the server, and arbitrary client code to interact with the student (e.g., for interactive drawing).

### `Calculation` question: `server.js`

`server.js` is the code that runs on the server (never seen directly by the client) which generates the question and grades the answer.

It can randomly (or systematically) create the question variables. Those are stored in an JSON element returned by server.getData()

It's a standard practice to define the answer when creating the question variables in the `server.getData()` function, but it's not required.

A function called `server.gradeAnswer()` can take in the parameters as well as the submittedAnswer and return the score and feedback.

    define(["PrairieRandom"], function(PrairieRandom) {
    
        var server = {};
    
        server.getData = function(vid) {
            var rand = new PrairieRandom.RandomGenerator(vid);
            var a = rand.randInt(5, 10);
            var b = rand.randInt(5, 10);
            var c = a + b;
            var params = {
                a: a,
                b: b,
            };
            var trueAnswer = {
                c: c,
            };
            var questionData = {
                params: params,
                trueAnswer: trueAnswer,
            };
            return questionData;
        };
    
        server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
            var score = 0;
            if (PrairieGeom.checkEqual(trueAnswer, submittedAnswer, 1e-2, 1e-8))
                score = 1;
            return {score: score};
        };
    
        return server;
    });

The three main objects associated with each question are:

Object            | Description
---               | ---
`params`          | The parameters specifying a particular question instance.
`submittedAnswer` | Everything submitted by the student to answer a question.
`trueAnswer`      | The correct answer to a question, shown to the student after the question is graded.

These are all JavaScript objects that are encoded as JSON for transport between the client and server.


### `Calculation` question: `client.js`

JavaScript presented to the client to display the question. Can be overloaded/expanded if specialized interfaces are used.

Different question types have different client-side javascript needs, so just copy it over from the default template for your question.


### `Calculation` question: `question.html`

`question.html` contains the HTML data presented to the student. It's the stuff inside the question box, including the problem and any input forms to answer it. A submit button (or other form setup) isn't needed.

Standard HTML is accepted here, as is LaTeX math enclosed in dollar signs, e.g., `$e^{i\pi} + 1 = 0$`.

Parameters generated by the question server can be inserted with `{{params.a}}`, etc.

Best practice for writing a question is to divide it into three sections:

1. Information about the problem, defining all variables, etc.
2. A short and clear question asking for a very specific answer.
3. The data entry fields.

For example:

    <p>
      The length $c$ is defined by
      $c = {{params.a}}{\rm\ m} + {{params.b}}{\rm\ m}$.
    </p>
    <p>
      What is $c$?
    </p>
    <p>
      $c = $ <input data-instavalue="submittedAnswer.c" />$\rm\ m$
    </p>


### `Calculation` question: `answer.html`

The part in the box shown to the student after the question has been graded.

    <p>
      $c = {{trueAnswer.c}}\rm\ m$.
    </p>


## Advanced: Generating LaTeX labels on figures

When using `PrairieDraw.js` to draw figures, figure labels can be included using either plain text, like `pd.text(..., "label")`, or with LaTeX, like `pd.text(..., "TEX:$x$")`. If you are using LaTeX labels then they have to be rendered into image files before they can be displayed, by running the commands:

    cd <FULL-PATH>\PrairieLearn
    ./make_tex_images.py         # on Linux or Mac
    python make_tex_images.py    # on Windows

This needs to be repeated after any LaTeX labels are added or changed. Running these commands requires the installation of [Python](https://www.python.org),  [ImageMagick](http://www.imagemagick.org/), and [LaTeX](http://tug.org/texlive/).

LaTeX labels are searched for by looking for strings of the form `"TEX:..."` or `'TEX:...'` (note the different quote types). Use the `""` form if you want to have `'` characters in the string itself, and vice versa.


## Advanced: Library code in `clientCode` and `serverCode`

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

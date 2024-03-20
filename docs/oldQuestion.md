# Old v1/v2 Question Format

**WARNING**: This page describes the old PrairieLearn question format, as used in v1 and v2. This question format will be supported indefinitely, but it is strongly recommended that all new questions be written in the [v3 format](questionFormat).

## Partial credit

By default all v1/v2 questions do not award partial credit. That is, a student either gets zero points or full points for the question. The question grading function (see below) can generate a fractional score in the range 0 to 1, but this is then rounded to 0 or 1 to give no points or full points. Scores below 0.5 are rounded down to 0, while scores equal to or above 0.5 are rounded up to 1. For example, if a question grading function returns 0.3 for a 10-point question, then this will result in zero points, while a grading score of 0.7 for the same question would give 10 points.

To give actual partial credit for a question, set `"partialCredit": true` in the `info.json` file for the question. This will make a score of 0.3 on a 10-point question award 3 points, for example.

## Question types for v1/v2 format

Questions in PrairieLearn v1/v2 can have the following types.

| Question type       | Description                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MultipleChoice`    | A multiple choice question (radio button). One correct answer and several incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized. |
| `MultipleTrueFalse` | A multiple choice question (radio button). One correct answer and several incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized. |
| `Checkbox`          | A multiple choice question (checkbox). Multiple correct and incorrect answers are selected from lists of correct and incorrect answers, and the order is randomized.               |
| `File`              | A file is provided to the student for download, and they have to upload an edited file for grading.                                                                                |
| `Calculation`       | A very general question type that allows server-side and client-side code to generate and grade questions.                                                                         |

See below for detailed information about each question type.

## `MultipleChoice` question type

- Example: [`fossilFuelsRadio`](https://github.com/PrairieLearn/PrairieLearn/tree/21be1db08978b6f8a8ca76c1e53681fe2ebe2fce/exampleCourse/questions/fossilFuelsRadio)
- Required files: `info.json`
- Options schema: [`MultipleChoice` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/questionOptionsMultipleChoice.json)

A `MultipleChoice` question has an `info.json` that provides the question text, one or more correct answers, and one or more incorrect answers. One correct answer is randomly chosen, and enough incorrect answers to make `numberAnswers` total answers, which are then displayed to the student in a random order. For example:

```json
{
  "title": "Advantages of fossil fuels (radio)",
  "topic": "Energy",
  "tags": ["comparative advantages", "fossil fuels", "renewables"],
  "type": "MultipleChoice",
  "options": {
    "text": "Which of the following is an advantage of fossil fuels relative to renewable energy sources?",
    "correctAnswers": ["Cheap", "High energy density", "Provide energy on demand"],
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
```

## `MultipleTrueFalse` question type

- Example: [`fossilFuelsTrueFalse`](https://github.com/PrairieLearn/PrairieLearn/tree/21be1db08978b6f8a8ca76c1e53681fe2ebe2fce/exampleCourse/questions/fossilFuelsTrueFalse)
- Required files: `info.json`
- Options schema: [`MultipleTrueFalse` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/questionOptionsMultipleTrueFalse.json)

A `MultipleTrueFalse` question has an `info.json` that provides the question text, zero or more true statements, and zero or more false statements. All the given statements are used, and are displayed to the students in a random order. For example:

```json
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
```

## `Checkbox` question type

- Example: [`fossilFuelsCheckbox`](https://github.com/PrairieLearn/PrairieLearn/tree/21be1db08978b6f8a8ca76c1e53681fe2ebe2fce/exampleCourse/questions/fossilFuelsCheckbox)
- Required files: `info.json`
- Options schema: [`Checkbox` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/questionOptionsCheckbox.json)

A `Checkbox` question has an `info.json` that provides the question text, one or more correct answers, and one or more incorrect answers. Several correct answers are randomly chosen (between `minCorrectAnswers` and `maxCorrectAnswers`, inclusive), and enough incorrect answers to make `numberAnswers` total answers, which are then displayed to the student in a random order. Depending on the values of `minCorrectAnswers` and `maxCorrectAnswers` it is possible to have all or none of the possible answers be correct. For example:

```json
{
  "title": "Advantages of fossil fuels (checkbox)",
  "topic": "Energy",
  "tags": ["comparative advantages", "fossil fuels", "renewables"],
  "type": "Checkbox",
  "options": {
    "text": "Which of the following are advantages of fossil fuels relative to renewable energy sources? Select all that apply.",
    "correctAnswers": ["Cheap", "High energy density", "Provide energy on demand"],
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
```

## `File` question type

- Example: [`fibonacciExternal`](https://github.com/PrairieLearn/PrairieLearn/tree/bb3fa6c4bc477172cc1e449161aa0e7981628ed8/exampleCourse/questions/fibonacciExternal)
- Required files: `info.json`, `question.html`, `answer.html`
- Options schema: [`File` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/questionOptionsFile.json)

A `File` question gives the student a file to download, and then requires an uploaded file for the answer. The downloaded file is specified in the `info.json` like:

```json
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
```

Note that a file question can also utilize external grading! See the [External grading docs](externalGrading.md).

## `Calculation` question type

- Example: [`addVectors`](https://github.com/PrairieLearn/PrairieLearn/blob/master/testCourse/questions/addVectors)
- Required files: `info.json`, `client.js`, `server.js`
- Options schema: [`Calculation` options](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/questionOptionsCalculation.json)

A `Calculation` question is the most general type of question, allowing arbitrary code to generate and grade the question instance on the server, and arbitrary client code to interact with the student (e.g., for interactive drawing).

### `Calculation` question: `server.js`

`server.js` is the code that runs on the server (never seen directly by the client) which generates the question and grades the answer.

It can randomly (or systematically) create the question variables. Those are stored in an JSON element returned by server.getData()

It's a standard practice to define the answer when creating the question variables in the `server.getData()` function, but it's not required.

A function called `server.gradeAnswer()` can take in the parameters as well as the submittedAnswer and return the score and feedback.

```javascript
define(['PrairieRandom'], function (PrairieRandom) {
  var server = {};

  server.getData = function (vid) {
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

  server.gradeAnswer = function (vid, params, trueAnswer, submittedAnswer, options) {
    var score = 0;
    if (PrairieGeom.checkEqual(trueAnswer, submittedAnswer, 1e-2, 1e-8)) score = 1;
    return { score: score };
  };

  return server;
});
```

The three main objects associated with each question are:

| Object            | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `params`          | The parameters specifying a particular question instance.                            |
| `submittedAnswer` | Everything submitted by the student to answer a question.                            |
| `trueAnswer`      | The correct answer to a question, shown to the student after the question is graded. |

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

```html
<p>The length $c$ is defined by $c = {{params.a}}{\rm\ m} + {{params.b}}{\rm\ m}$.</p>
<p>What is $c$?</p>
<p>$c = $ <input data-instavalue="submittedAnswer.c" />$\rm\ m$</p>
```

### `Calculation` question: `answer.html`

The part in the box shown to the student after the question has been graded.

```html
<p>$c = {{trueAnswer.c}}\rm\ m$.</p>
```

## Accessing files from code via RequireJS

These library files are separated into _client_ and _server_ libraries. Client libraries are accessible from both `client.js` and `server.js` in each question, while server libraries are only accessible from `server.js`. This means that any secret code that students should not be able to access can be put in a server library, while other non-sensitive code can go in client libraries. There is never a need to put a library file into both the client and server directories, because it can just go only into the client directory and be accessed directly from there by both `client.js` and `server.js`.

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

## Library code and other files

See [clientFiles and serverFiles](clientServerFiles.md) for information on accessing `clientFiles` and `serverFiles` directories from within question code.

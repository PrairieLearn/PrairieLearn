# PrairieLearn API

## Overview

There are five main PrairieLearn components:

* Database
* PrairieLearn API Server
* PrairieLearn Web Server
* PrairieLearn WebApp
* Questions

The PrairieLearn Web Server sends the PrairieLearn WebApp code and resources to the browser. The PrairieLearn Web Server only serves static resources and it does not computation itself.

The PrairieLearn API Server and PrairieLearn WebApp communicate over the _Server API_ (see below).

The PrairieLearn API Server is the only component that communicates with the Database.

Each Question includes both a server and client JavaScript component. The PrairieLearn API Server executes communicates with the `server.js` Question component. The PrairieLearn API Server also transmits the `client.js` Question component to the PrairieLearn WebApp as JavaScript source-code. The WebApp then executes and communicates with the `client.js` component.

The communication between both the Server and the WebApp with the Question occurs over the _Question API_ (see below).


## Server API

The PrairieLearn server presents a RESTful HTTP API (Level 2 on the [Richardson Maturity Model](http://martinfowler.com/articles/richardsonMaturityModel.html)).


### Server API: Identifiers

All ID objects are strings. They should be treated as opaque identifiers and should not be interpreted for any information.

ID       | Identified resource   | Example
---      | ---                   | ---
`<qid>`  | Question              | `scalarAdd`
`<uid>`  | User                  | `mwest`
`<vid>`  | Variant of a question | `ac45b0`
`<sid>`  | Submission            | `s533`
`<qiid>` | Question instance     | `qi4228`
`<tid>`  | Test                  | `midterm2`
`<tiid>` | Test instance         | `ti4241`
`<pid>`  | Pull instance         | `p273`


### Server API: Method calls

The general pattern is that a collection `/collect` can
generally be accessed in three ways:

* A GET to `/collect` returns all the objects in the collection, each with a minimal representation containing at least the `<id>` property. An optional query string to the GET may allow for filtering of the return list by certain object properties.

* A POST to `/collect` creates a new object in the collection and returns its `<id>`. The POST data may need to contain some of the properties of the new object. The newly created object will typically have some of its properties filled in by the server upon creation.

* A GET to `/collect/<id>` returns the single specified object in complete form.


Path                             | Method | Action                                                   | Send                                  | Return
---                              | ---    | ---                                                      | ---                                   | ---
`/questions`                     | GET    | —                                                        | —                                     | JSON: List of all `<question>` objects.
`/questions/<qid>`               | GET    | —                                                        | —                                     | JSON: Single `<question>` object.
`/users`                         | GET    | —                                                        | —                                     | JSON: List of all `<user>` objects.
`/users/<uid>`                   | GET    | —                                                        | —                                     | JSON: Single `<user>` object.
`/qInstances`                    | GET    | —                                                        | —                                     | JSON: List of all `<qInstance>` objects, optionally filtered by `<uid>` or `<qid>` parameters.
`/qInstances`                    | POST   | Creates new qInstance object.                            | JSON: partial `<qInstance>` object.   | JSON: complete newly created `<qInstance>` object.
`/qInstances/<qiid>`             | GET    | —                                                        | —                                     | JSON: Single `<qInstance>` object.
`/qInstances/<qiid>/client.js`   | GET    | —                                                        | —                                     | Text: JavaScript question client code.
`/qInstances/<qiid>/<filename>`  | GET    | —                                                        | —                                     | Other question files (type determined by filename extension).
`/submissions`                   | GET    | —                                                        | —                                     | JSON: List of all `<submission>` objects, optionally filtered by `<uid>` or `<qid>` parameters.
`/submissions`                   | POST   | Creates new submission object.                           | JSON: partial `<submission>` object.  | JSON: complete newly created `<submission>` object.
`/submissions/<sid>`             | GET    | —                                                        | —                                     | JSON: Single `<submission>` object.
`/tests`                         | GET    | —                                                        | —                                     | JSON: List of all `<test>` objects.
`/tests/<tid>`                   | GET    | —                                                        | —                                     | JSON: Single `<test>` object.
`/tests/<tid>/client.js`         | GET    | —                                                        | —                                     | Text: JavaScript test client code.
`/tests/<tid>/common.js`         | GET    | —                                                        | —                                     | Text: JavaScript test client-server-shared code.
`/tests/<tid>/test.html`         | GET    | —                                                        | —                                     | Text: HTML question template for test.
`/tests/<tid>/testOverview.html` | GET    | —                                                        | —                                     | Text: HTML question template for test overview.
`/tests/<tid>/testSidebar.html`  | GET    | —                                                        | —                                     | Text: HTML question template for test sidebar.
`/tInstances`                    | GET    | —                                                        | —                                     | JSON: List of all `<tInstance>` objects, optionally filtered by `<uid>`.
`/tInstances/<tiid>`             | GET    | —                                                        | —                                     | JSON: Single `<tInstance>` object.
`/tInstances`                    | POST   | Creates new tInstance object.                            | JSON: partial `<tInstance>` object.   | JSON: complete newly created `<tInstance>` object.
`/tInstances/<tiid>`             | PATCH  | Updates an existing `<tInstance>` (used to grade tests). | JSON: partial `<tInstance>` object.   | JSON: complete updated `<tInstance>` object.
`/course`                        | GET    | -                                                        | -                                     | JSON: The `<courseInfo>` object.
`/coursePulls`                   | GET    | -                                                        | -                                     | JSON: List of all `<coursePull>` objects.
`/coursePulls/current`           | GET    | -                                                        | -                                     | JSON: The current `<coursePull>` object.
`/coursePulls`                   | POST   | Creates new `<coursePull>` object.                       | JSON: particle `<coursePull>` object. | JSON: complete newly created `<coursePull>` object.
  
### Server API: JSON object specifications

  <table>
    <tr><th>Object</th><th>Specification</th></tr>
    <tr>
      <td>
        <code>&lt;question&gt;</code>
      </td>
      <td>
        <pre>
{
  "qid": &lt;string&gt;,
  "title": &lt;string&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;user&gt;</code>
      </td>
      <td>
        <pre>{
  "uid": &lt;string&gt;,
  "name": &lt;string&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;qInstance&gt;</code>
      </td>
      <td>
        <pre>{
  "qiid": &lt;string&gt;
  "title": &lt;string&gt;
  "date": &lt;date&gt;,
  "uid": &lt;string&gt;,
  "tiid": &lt;string&gt;
  "qid": &lt;string&gt;,
  "vid": &lt;string&gt;,
  "params": &lt;params&gt;,
  "trueAnswer": &lt;trueAnswer&gt; // optional
  "options": &lt;object&gt; // optional
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;params&gt;</code>
      </td>
      <td>
        Question-specific object with name/value pairs for the
        question data.
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;submittedAnswer&gt;</code>
      </td>
      <td>
        Question-specific object with name/value pairs for the
        submitted answer data.
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;trueAnswer&gt;</code>
      </td>
      <td>
        Question-specific object with name/value pairs for the
        true answer data.
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;feedback&gt;</code>
      </td>
      <td>
        Question-specific object with name/value pairs for feedback
        data.
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;questionData&gt;</code>
      </td>
      <td>
        <pre>{
  "params": &lt;params&gt;,
  "trueAnswer": &lt;trueAnswer&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;submission&gt;</code>
      </td>
      <td>
        <pre>{
  "sid": &lt;string&gt;
  "date": &lt;date&gt;,
  "uid": &lt;string&gt;,
  "qiid": &lt;string&gt;,
  "submittedAnswer": &lt;submittedAnswer&gt;,
  "overrideScore": &lt;number&gt;, // optional
  "practice": &lt;boolean&gt;, // optional
  "score": &lt;number&gt;,
  "feedback": &lt;feedback&gt;,
  "trueAnswer": &lt;trueAnswer&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;grading&gt;</code>
      </td>
      <td>
        <pre>{
  "score": &lt;number&gt;,
  "feedback": &lt;feedback&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;test&gt;</code>
      </td>
      <td>
        <pre>{
  "tid": &lt;string&gt;,
  "title": &lt;string&gt;,
  "type": &lt;string&gt;,
  "number": &lt;number&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;tInstance&gt;</code>
      </td>
      <td>
        <pre>{
  "tiid": &lt;string&gt;,
  "uid": &lt;string&gt;,
  "tid": &lt;string&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;courseInfo&gt;</code>
      </td>
      <td>
        <pre>{
  "name": &lt;string&gt;,
  "title": &lt;string&gt;
}</pre>
      </td>
    </tr>
    <tr>
      <td>
        <code>&lt;coursePull&gt;</code>
      </td>
      <td>
        <pre>{
  "pid": &lt;string&gt;,
  "createDate": &lt;date&gt;,
  "createUID": &lt;string&gt;,
  "subject": &lt;string&gt;,
  "commitHash": &lt;string&gt;,
  "refNames": &lt;string&gt;,
  "authorName": &lt;string&gt;,
  "authorEmail": &lt;string&gt;,
  "authorDate": &lt;string&gt;,
  "committerName": &lt;string&gt;,
  "committerEmail": &lt;string&gt;,
  "committerDate": &lt;string&gt;
}</pre>
      </td>
    </tr>
  </table>


### Server API: Error reporting

The PrairieLearn server only uses the following HTTP status codes:

HTTP status code | Meaning
---              | ---
200              | Success
400              | Invalid request
403              | Forbidden
404              | No object with given ID
500              | Internal server error
  

## Question API

The PrairieLearn Questions consist of `server.js` and `client.js` components. These present a JavaScript API for communication with the PrairieLearn Server and the PrairieLearn WebApp. The Question components `server.js` and `client.js` should be loaded with [RequireJS](http://requirejs.org/) to obtain the corresponding `<server>` and `<client>` objects.


### Question server API

Function      | Arguments                                                             | Return           | Description
---           | ---                                                                   | ---              | ---
`getData`     |  `<vid>`, `<options>`                                                 | `<questionData>` | Generate question-specific `<questionData>` describing the particular instance of the question using the random `<vid>`. This function must be deterministic, so that a particular `<vid>` always generates the same `<questionData>`.
`gradeAnswer` | `<vid>`, `<params>`, `<trueAnswer>`, `<submittedAnswer>`, `<options>` | `<grading>`      | Determine whether the given `<submittedAnswer>` object is correct for the question instance corresponding to the given `<vid>`, and return the correctness information in the `<grading>` object.


### Question client API

Function                        | Arguments                             | Return | Description
---                             | ---                                   | ---    | ---
`initialize`                    | `<params>`                            | —      | Initialize the question client with the given question parameters. This will be called before any other functions on the client.
`renderQuestion`                | `<questionDivID>`, `<changeCallback>` | —      | Render the question into the `div` with the given ID. The `<changeCallback>` argument is a function that must be called (with no arguments) when the user changes their answer to the question. The `renderQuestion()` function will not be called multiple times without an intervening call to `close()`. The `setSubmittedAnswer()` and `setTrueAnswer()` functions may be called before or after `renderQuestion()`.
`renderAnswer`                  | `<answerDivID>`                       | —      | Render the true answer into the `div` with the given ID. The `renderAnswer()` function will not be called multiple times without an intervening call to `close()`. The `setSubmittedAnswer()` and `setTrueAnswer()` functions may be called before or after `renderAnswer()`.
`close`</td> <td>—</td> <td>—   | Remove any listeners or other hooks associated with the client. Called just before the client rendering is removed from the DOM.
`isComplete`</td> <td>—         | `<boolean>`                           | Return `true` if the question can be graded, otherwise `false`.
`getSubmittedAnswer`</td> <td>— | `<submittedAnswer>`                   | Return the current state of the question input as a `<submittedAnswer>` object (possibly only partially complete).
`setSubmittedAnswer`            | `<submittedAnswer>`                   | —      | Set the current state of the question input from the provided `<submittedAnswer>` object (possibly only partially complete).
`setTrueAnswer`                 | `<trueAnswer>`                        | —      | Set the current state of the true answer from the provided `<trueAnswer>` object.
`setFeedback`                   | `<feedback>`                          | —      | Set the current state of the question feedback from the provided `<feedback>` object.
  

## Sample execution flows

### Solving a question with a random variant

The steps to ask and answer a question with a random variant are:

1. Decide which `<qid>` we want to attempt.

1. POST to `/qInstances` with a partial qInstance of the form:

        {
          "uid": <uid>,
          "qid": <qid>
        }

1. The return value will be a completed qInstance object of the form:

        {
          "qiid": <qiid>,
          "date": <date>,
          "uid": <uid>,
          "qid": <qid>,
          "params": <params>
        }

  Take the randomly generated variant ID `<vid>` from here.

1. GET the question client code from `/questions/<qid>/<vid>/client.js`

1. Call `client.initialize()` and `client.renderQuestion()`, passing a callback for change notifications.

1. Wait until the change callback fires and `client.isComplete()` returns `true`, and then further wait until the user indicates the desire to submit the answer for grading.

1. Call `client.getSubmittedAnswer()` to obtain a `<submittedAnswer>` object.

1. POST to `/submissions` with a partial submission object of the form:

        {
          "uid": <uid>,
          "qiid": <qiid>,
          "submittedAnswer": <submittedAnswer>
        }

1. The return value will be a completed submission object of the form:

        {
          "sid": <sid>,
          "date": <date>,
          "uid": <uid>,
          "qiid": <qiid>,
          "submittedAnswer": <submittedAnswer>,
          "score": <number>,
          "feedback": <feedback>,
          "trueAnswer": <trueAnswer>
        }

1. Show the score to the user and call `client.setTrueAnswer()` and `client.renderAnswer()` to display the true answer.


## SimpleClient

Rather than implementing a general client interface, the SimpleClient library allows the easy creation of questions with a certain structure.

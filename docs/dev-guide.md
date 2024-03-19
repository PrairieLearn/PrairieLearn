# Developer Guide

In general we prefer simplicity. We standardize on JavaScript (Node.js) and SQL (PostgreSQL) as the languages of implementation and try to minimize the number of complex libraries or frameworks being used. The website is server-side generated pages with minimal client-side JavaScript.

## High level view

![High level system structure](high-level.png)

- The questions and assessments for a course are stored in a git repository. This is synced into the database by the course instructor and DB data is updated or added to represent the course. Students then interact with the course website by doing questions, with the results being stored in the DB. The instructor can view the student results on the website and download CSV files with the data.

- All course configuration is done via plain text files in the git repository, which is the master source for this data. There is no extra course configuration stored in the DB. The instructor does not directly edit course data via the website.

- All student data is all stored in the DB and is not pushed back into the git repository or disk at any point.

## Directory layout

- Broadly follow the [Express generator](http://expressjs.com/en/starter/generator.html) layout.

- Top-level files and directories are:

  ```text
  PrairieLearn
  +-- autograder         # files needed to autograde code on a separate server
  |   `-- ...            # various scripts and docker images
  +-- config.json        # server configuration file (optional)
  +-- cron               # jobs to be periodically executed, one file per job
  |   +-- index.js       # entry point for all cron jobs
  |   `-- ...            # one JS file per cron job, executed by index.js
  +-- docs               # documentation
  +-- exampleCourse      # example content for a course
  +-- lib                # miscellaneous helper code
  +-- middlewares        # Express.js middleware, one per file
  +-- migrations         # DB migrations
  |   +-- ...            # one PGSQL file per migration, executed in order of their timestamp
  +-- package.json       # JavaScript package manifest
  +-- pages              # one sub-dir per web page
  |   +-- partials       # EJS helper sub-templates
  |   +-- instructorHome # all the code for the instructorHome page
  |   +-- userHome       # all the code for the userHome page
  |   `-- ...            # other "instructor" and "user" pages
  +-- public             # all accessible without access control
  |   +-- javascripts    # external packages only, no modifications
  |   +-- localscripts   # all local site-wide JS
  |   `-- stylesheets    # all CSS, both external and local
  +-- question-servers   # one file per question type
  +-- server.js          # top-level program
  +-- sprocs             # DB stored procedures, one per file
  |   +-- index.js       # entry point for all sproc initialization
  |   `-- ...            # one JS file per sproc, executed by index.js
  +-- sync               # code to load on-disk course config into DB
  `-- tests              # unit and integration tests
  ```

## Unit tests and integration tests

- Tests are stored in the `tests/` directory and listed in `tests/index.js`.

- To run the tests during development, see [Running the test suite](../installingLocal/#running-the-test-suite).

- The tests are run by the CI server on every push to GitHub.

- The tests are mainly integration tests that start with a blank database, run the server to initialize the database, load the `testCourse`, and then emulate a client web browser that answers questions on assessments. If a test fails then it is often easiest to debug by recreating the error by doing questions yourself against a locally-running server.

- If the `PL_KEEP_TEST_DB` environment is set, the test database (normally `pltest`) won't be DROP'd when testing ends. This allows you inspect the state of the database whenever your testing ends. The database will get overwritten when you start a new test.

## Debugging server-side JavaScript

- Use the [debug package](https://www.npmjs.com/package/debug) to help trace execution flow in JavaScript. To run the server with debugging output enabled:

  ```sh
  DEBUG=* make dev
  ```

- To just see debugging logs from PrairieLearn you can use:

  ```sh
  DEBUG=prairielearn:* make dev
  ```

- To insert more debugging output, import `debug` and use it like this:

  ```javascript
  var path = require('path');
  var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

  // in some function later
  debug('func()', 'param:', param);
  ```

- As of 2017-08-08 we don't have very good coverage with debug output in code, but we are trying to add more as needed, especially in code in `lib/`.

- `UnhandledPromiseRejectionWarning` errors are frequently due to improper async/await handling. Make sure you are calling async functions with `await`, and that async functions are not being called from callback-style code without a `callbackify()`. To get more information, Node >= 14 can be run with the `--trace-warnings` flag. For example, `node_modules/.bin/mocha --trace-warnings tests/index.js`.

## Debugging client-side JavaScript

- Make sure you have the JavaScript Console open in your browser and reload the page.

## Debugging SQL and PL/pgSQL

- Use the [`psql`](https://www.postgresql.org/docs/current/app-psql.html) commandline interface to test SQL separately. A default development PrairieLearn install uses the `postgres` database, so you should run:

  ```sh
  psql postgres
  ```

- To debug syntax errors in a stored procedure, import it manually with `\i filename.sql` in `psql`.

- To follow execution flow in PL/pgSQL use `RAISE NOTICE`. This will log to the console when run from `psql` and to the server log file when run from within PrairieLearn. The syntax is:

  ```sql
  RAISE NOTICE 'This is logging: % and %',
  var1,
  var2;
  ```

- To manually run a function:

  ```sql
  SELECT
    the_sql_function (arg1, arg2);
  ```

## HTML page generation

- Use [Express](http://expressjs.com) as the web framework.

- All pages are server-side rendered and we try and minimize the amount of client-side JavaScript. Client-side JS should use [jQuery](https://jquery.com) and related libraries. We prefer to use off-the-shelf jQuery plugins where possible.

- Each web page typically has all its files in a single directory, with the directory, the files, and the URL all named the same. Not all pages need all files. For example:

  ```text
  pages/instructorGradebook
  +-- instructorGradebook.js         # main entry point, calls the SQL and renders the template
  +-- instructorGradebook.sql        # all SQL code specific to this page
  +-- instructorGradebook.ejs        # the EJS template for the page
  `-- instructorGradebookClient.js   # any client-side JS needed
  ```

- The above `instructorGradebook` page is loaded from the top-level `server.js` with:

  ```javascript
  app.use(
    '/instructor/:courseInstanceId/gradebook',
    require('./pages/instructorGradebook/instructorGradebook'),
  );
  ```

- The `instructorGradebook.js` main JS file is an Express `router` and has the basic structure:

  ```javascript
  var ERR = require('async-stacktrace');
  var _ = require('lodash');
  var express = require('express');
  var router = express.Router();
  var sqldb = require('@prairielearn/postgres');
  var sql = sqldb.loadSqlEquiv(__filename);

  router.get('/', function (req, res, next) {
    var params = { course_instance_id: res.params.courseInstanceId };
    sqldb.query(sql.user_scores, params, function (err, result) {
      // SQL queries for page data
      if (ERR(err, next)) return;
      res.locals.user_scores = result.rows; // store the data in res.locals

      res.render('pages/instructorGradebook/instructorGradebook', res.locals); // render the page
      // inside the EJS template, "res.locals.var" can be accessed with just "var"
    });
  });

  module.exports = router;
  ```

- Use the `res.locals` variable to build up data for the page rendering. Many basic objects are already included from the `selectAndAuthz*.js` middleware that runs before most page loads.

- Use [EJS templates](http://ejs.co) (Embedded JavaScript) templates for all pages. Using JS as the templating language removes the need for another ad hoc language, but does require some discipline to not get in a mess. Try and minimize the amount of JS code in the template files. Inside a template the JS code can directly access the contents of the `res.locals` object.

- Sub-templates are stored in `pages/partials` and can be loaded as below. The sub-template can also access `res.locals` as its base scope, and can also accept extra arguments with an arguments object:

  ```javascript
  <%- include('../partials/assessment', {assessment: assessment}); %>
  ```

## HTML style

- Use [Bootstrap](http://getbootstrap.com) as the style. As of 2019-12-13 we are using v4.

- Local CSS rules go in `public/stylesheets/local.css`. Try to minimize use of this and use plain Bootstrap styling wherever possible.

- Buttons should use the `<button>` element when they take actions and the `<a>` element when they are simply links to other pages. We should not use `<a role="button">` to fake a button element. Buttons that do not submit a form should always start with `<button type="button" class="btn ...">`, where `type="button"` specifies that they don't submit.

## SQL usage

- Use [PostgreSQL](https://www.postgresql.org) and feel free to use the latest features.

- The [PostgreSQL manual](https://www.postgresql.org/docs/manuals/) is an excellent reference.

- Write raw SQL rather than using a [ORM library](https://en.wikipedia.org/wiki/Object-relational_mapping). This reduces the number of frameworks/languages needed.

- Try and write as much code in SQL and [PL/pgSQL](https://www.postgresql.org/docs/9.5/static/plpgsql.html) as possible, rather than in JavaScript. Use PostgreSQL-specific SQL and don't worry about SQL dialect portability. Functions should be written as stored procedures in the `sprocs/` directory.

- The `sprocs/` directory has files that each contain exactly one stored procedure. The filename is the same as the name of the stored procedure, so the `variants_insert()` stored procedure is in the `sprocs/variants_insert.sql` file.

- Stored procedure names should generally start with the name of the table they are associated with and try to use standard SQL command names to describe what they do. For example, `variants_insert()` will do some kind of `INSERT INTO variants`, while `submission_update_parsing()` will do an `UPDATE submissions` with some parsing data.

- Use the SQL convention of [`snake_case`](https://en.wikipedia.org/wiki/Snake_case) for names. Also use the same convention in JavaScript for names that are the same as in SQL, so the `question_id` variable in SQL is also called `question_id` in JavaScript code.

- Use uppercase for SQL reserved words like `SELECT`, `FROM`, `AS`, etc.

- SQL code should not be inline in JavaScript files. Instead it should be in a separate `.sql` file, following the [Yesql concept](https://github.com/krisajenkins/yesql). Each `filename.js` file will normally have a corresponding `filename.sql` file in the same directory. The `.sql` file should look like:

  ```sql
  -- BLOCK select_question
  SELECT
    *
  FROM
    questions
  WHERE
    id = $question_id;
  
  -- BLOCK insert_submission
  INSERT INTO
    submissions (submitted_answer)
  VALUES
    ($submitted_answer)
  RETURNING
    *;
  ```

From JavaScript you can then do:

```javascript
var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename); // from filename.js will load filename.sql

// run the entire contents of the SQL file
sqldb.query(sql.all, params, ...);

// run just one query block from the SQL file
sqldb.query(sql.select_question, params, ...);
```

- The layout of the SQL code should generally have each list in separate indented blocks, like:

  ```sql
  SELECT
    ft.col1,
    ft.col2 AS renamed_col,
    st.col1
  FROM
    first_table AS ft
    JOIN second_table AS st ON (st.first_table_id = ft.id)
  WHERE
    ft.col3 = select3
    AND st.col2 = select2
  ORDER BY
    ft.col1;
  ```

- To keep SQL code organized it is a good idea to use [CTEs (`WITH` queries)](https://www.postgresql.org/docs/current/static/queries-with.html). These are formatted like:

  ```sql
  WITH
    first_preliminary_table AS (
      SELECT
        -- first preliminary query
    ),
    second_preliminary_table AS (
      SELECT
        -- second preliminary query
    )
  SELECT
    -- main query here
  FROM
    first_preliminary_table AS fpt,
    second_preliminary_table AS spt;
  ```

## DB stored procedures (sprocs)

- Stored procedures are created by the files in `sprocs/`. To call a stored procedure from JavaScript, use code like:

  ```
  const workspace_id = 1342;
  const message = 'Startup successful';
  sqldb.call('workspaces_message_update', [workspace_id, message], (err, result) => {
      if (ERR(err, callback)) return;
      // we could use the result here if we want the return value of the stored procedure
      callback(null);
  });
  ```

- The stored procedures are all contained in a separate [database schema](https://www.postgresql.org/docs/12/ddl-schemas.html) with a name like `server_2021-07-07T20:25:04.779Z_T75V6Y`. To see a list of the schemas use the `\dn` command in `psql`.

- To be able to use the stored procedures from the `psql` command line it is necessary to get the most recent schema name using `\dn` and set the `search_path` to use this _quoted_ schema name and the `public` schema:

  ```
  set search_path to "server_2021-07-07T20:25:04.779Z_T75V6Y",public;
  ```

- During startup we initially have no non-public schema in use. We first run the migrations to update all tables in the `public` schema, then we call `sqldb.setRandomSearchSchemaAsync()` to activate a random per-execution schema, and we run the sproc creation code to generate all the stored procedures in this schema. This means that every invocation of PrairieLearn will have its own locally-scoped copy of the stored procedures which are the correct versions for its code. This lets us upgrade PrairieLearn servers one at a time, while old servers are still running with their own copies of their sprocs. When PrairieLearn first starts up it has `search_path = public`, but later it will have `search_path = "server_2021-07-07T20:25:04.779Z_T75V6Y",public` so that it will first search the random schema and then fall back to `public`. The naming convention for the random schema uses the local instance name, the date, and a random string. Note that schema names need to be quoted using double-quotations in `psql` because they contain characters such as hyphens.

- For more details see `sprocs/array_and_number.sql` and comments in `server.js` near the call to `sqldb.setRandomSearchSchemaAsync()`.

## DB schema (simplified overview)

- The most important tables in the database are shown in the diagram below (also as a [PDF image](simplified-models.pdf)).

![Simplified DB Schema](simplified-models.png)

- Detailed descriptions of the format of each table are in the [list of DB tables](https://github.com/PrairieLearn/PrairieLearn/blob/master/database/tables/).

- Each table has an `id` number that is used for cross-referencing. For example, each row in the `questions` table has an `id` and other tables will refer to this as a `question_id`. The only exceptions are the `pl_courses` table that other tables refer to with `course_id` and `users` which has a `user_id`. These are both for reasons of interoperability with PrairieSchedule.

- Each student is stored as a single row in the `users` table.

- The `pl_courses` table has one row for each course, like `TAM 212`.

- The `course_instances` table has one row for each semester (“instance”) of each course, with the `course_id` indicating which course it belongs to.

- Every question is a row in the `questions` table, and the `course_id` shows which course it belongs to. All the questions for a course can be thought of as the “question pool” for that course. This same pool is used for all semesters (all course instances).

- Assessments are stored in the `assessments` table and each assessment row has a `course_instance_id` to indicate which course instance (and hence which course) it belongs to. An assessment is something like “Homework 1” or “Exam 3”. To determine this we can use the `assessment_set_id` and `number` of each assessment row.

- Each assessment has a list of questions associated with it. This list is stored in the `assessment_questions` table, where each row has a `assessment_id` and `question_id` to indicate which questions belong to which assessment. For example, there might be 20 different questions that are on “Exam 1”, and it might be the case that each student gets 5 of these questions randomly selected.

- Each student will have their own copy of an assessment, stored in the `assessment_instances` table with each row having a `user_id` and `assessment_id`. This is where the student's score for that assessment is stored.

- The selection of questions that each student is given on each assessment is in the `instance_questions` table. Here each row has an `assessment_question_id` and an `assessment_instance_id` to indicate that the corresponding question is on that assessment instance. This row will also store the student's score on this particular question.

- Questions can randomize their parameters, so there are many possible variants of each question. These are stored in the `variants` table with an `instance_question_id` indicating which instance question the variant belongs to.

- For each variant of a question that a student sees they will have submitted zero or more `submissions` with a `variant_id` to show what it belongs to. The submissions row also contains information the submitted answer and whether it was correct.

## DB schema (full data)

- See the [list of DB tables](https://github.com/PrairieLearn/PrairieLearn/blob/master/database/tables/), with the ER (entity relationship) diagram below ([PDF ER diagram](models.pdf)).

![DB Schema](models.png)

## DB schema conventions

- Tables have plural names (e.g. `assessments`) and always have a primary key called `id`. The foreign keys pointing to this table are non-plural, like `assessment_id`. When referring to this use an abbreviation of the first letters of each word, like `ai` in this case. The only exceptions are `aset` for `assessment_sets` (to avoid conflicting with the SQL `AS` keyword), `top` for `topics`, and `tag` for `tags` (to avoid conflicts). This gives code like:

  ```sql
  -- select all active assessment_instances for a given assessment
  SELECT
    ai.*
  FROM
    assessments AS a
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  WHERE
    a.id = 45
    AND ai.deleted_at IS NULL;
  ```

- We (almost) never delete student data from the DB. To avoid having rows with broken or missing foreign keys, course configuration tables (e.g. `assessments`) can't be actually deleted. Instead they are "soft-deleted" by setting the `deleted_at` column to non-NULL. This means that when using any soft-deletable table we need to have a `WHERE deleted_at IS NULL` to get only the active rows.

## DB schema modification

See [`migrations/README.md`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/migrations/README.md)

## JSON syncing

- Edit the DB schema; e.g., to add a `require_honor_code` boolean for assessments, modify `database/tables/assessments.pg`:

  ```diff
  @@ -16,2 +16,3 @@ columns
      order_by: integer
  +    require_honor_code: boolean default true
      shuffle_questions: boolean default false
  ```

- Add a DB migration; e.g., create `migrations/167_assessments__require_honor_code__add.sql`:

  ```diff
  @@ -0,0 +1 @@
  +ALTER TABLE assessments ADD COLUMN require_honor_code boolean DEFAULT true;
  ```

- Edit the JSON schema; e.g., modify `schemas/schemas/infoAssessment.json`:

  ```diff
  @@ -89,2 +89,7 @@
              "default": true
  +        },
  +        "requireHonorCode": {
  +            "description": "Requires the student to accept an honor code before starting exam assessments.",
  +            "type": "boolean",
  +            "default": true
          }
  ```

- Edit the sync parser; e.g., modify `sync/fromDisk/assessments.js`:

  ```diff
  @@ -44,2 +44,3 @@ function buildSyncData(courseInfo, courseInstance, questionDB) {
          const allowRealTimeGrading = !!_.get(assessment, 'allowRealTimeGrading', true);
  +        const requireHonorCode = !!_.get(assessment, 'requireHonorCode', true);

  @@ -63,2 +64,3 @@ function buildSyncData(courseInfo, courseInstance, questionDB) {
              allow_real_time_grading: allowRealTimeGrading,
  +            require_honor_code: requireHonorCode,
              auto_close: !!_.get(assessment, 'autoClose', true),
  ```

- Edit the sync query; e.g., modify `sprocs/sync_assessments.sql`:

  ```diff
  @@ -44,3 +44,4 @@ BEGIN
              allow_issue_reporting,
  -            allow_real_time_grading)
  +            allow_real_time_grading,
  +            require_honor_code)
              (
  @@ -64,3 +65,4 @@ BEGIN
                  (assessment->>'allow_issue_reporting')::boolean,
  -                (assessment->>'allow_real_time_grading')::boolean
  +                (assessment->>'allow_real_time_grading')::boolean,
  +                (assessment->>'require_honor_code')::boolean
          )
  @@ -83,3 +85,4 @@ BEGIN
              allow_issue_reporting = EXCLUDED.allow_issue_reporting,
  -            allow_real_time_grading = EXCLUDED.allow_real_time_grading
  +            allow_real_time_grading = EXCLUDED.allow_real_time_grading,
  +            require_honor_code = EXCLUDED.require_honor_code
          WHERE
  ```

- Edit the sync tests; e.g., modify `tests/sync/util.js`:

  ```diff
  @@ -128,2 +128,3 @@ const syncFromDisk = require('../../sync/syncFromDisk');
    * @property {boolean} allowRealTimeGrading
  + * @property {boolean} requireHonorCode
    * @property {boolean} multipleInstance
  ```

- Add documentation; e.g., the honor code option is described at [Assessments -- Honor code](assessment.md#honor-code).

- Add [tests](#unit-tests-and-integration-tests).

## Database access

- DB access is via the `sqldb.js` module. This wraps the [node-postgres](https://github.com/brianc/node-postgres) library.

- For single queries we normally use the following pattern, which automatically uses connection pooling from node-postgres and safe variable interpolation with named parameters and [prepared statements](https://github.com/brianc/node-postgres/wiki/Parameterized-queries-and-Prepared-Statements):

  ```javascript
  var params = {
    course_id: 45,
  };
  sqldb.query(sql.select_questions_by_course, params, function (err, result) {
    if (ERR(err, callback)) return;
    var questions = result.rows;
  });
  ```

Where the corresponding `filename.sql` file contains:

```sql
-- BLOCK select_questions_by_course
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id;
```

- For queries where it would be an error to not return exactly one result row:

  ```javascript
  sqldb.queryOneRow(sql.block_name, params, function (err, result) {
    if (ERR(err, callback)) return;
    var obj = result.rows[0]; // guaranteed to exist and no more
  });
  ```

- Use explicit row locking whenever modifying student data related to an assessment. This must be done within a transaction. The rule is that we lock either the variant (if there is no corresponding assessment instance) or the assessment instance (if we have one). It is fine to repeatedly lock the same row within a single transaction, so all functions involved in modifying elements of an assessment (e.g., adding a submission, grading, etc) should call a locking function when they start. All locking functions are equivalent in their action, so the most convenient one should be used in any given situation:

  | Locking function            | Argument                 |
  | --------------------------- | ------------------------ |
  | `assessment_instances_lock` | `assessment_instance_id` |
  | `instance_questions_lock`   | `instance_question_id`   |
  | `variants_lock`             | `variant_id`             |
  | `submission_lock`           | `submission_id`          |

- To pass an array of parameters to SQL code, use the following pattern, which allows zero or more elements in the array. This replaces `$points_list` with `ARRAY[10, 5, 1]` in the SQL. It's required to specify the type of array in case it is empty:

  ```javascript
  var params = {
      points_list: [10, 5, 1],
  };
  sqldb.query(sql.insert_assessment_question, params, ...);
  ```

  ```sql
  -- BLOCK insert_assessment_question
  INSERT INTO
    assessment_questions (points_list)
  VALUES
    ($points_list::INTEGER[]);
  ```

- To use a JavaScript array for membership testing in SQL use [`unnest()`](https://www.postgresql.org/docs/9.5/static/functions-array.html) like:

  ```javascript
  var params = {
      id_list: [7, 12, 45],
  };
  sqldb.query(sql.select_questions, params, ...);
  ```

  ```sql
  -- BLOCK select_questions
  SELECT
    *
  FROM
    questions
  WHERE
    id IN (
      SELECT
        unnest($id_list::INTEGER[])
    );
  ```

- To pass a lot of data to SQL a useful pattern is to send a JSON object array and unpack it in SQL to the equivalent of a table. This is the pattern used by the "sync" code, such as [sprocs/sync_news_items.sql](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/sprocs/sync_news_items.sql). For example:

  ```javascript
  let data = [
      {a: 5, b: "foo"},
      {a: 9, b: "bar"}
  ];
  let params = {data: JSON.stringify(data)};
  sqldb.query(sql.insert_data, params, ...);
  ```

  ```sql
  -- BLOCK insert_data
  INSERT INTO
    my_table (a, b)
  SELECT
    *
  FROM
    jsonb_to_recordset($data) AS (a INTEGER, b TEXT);
  ```

- To use a JSON object array in the above fashion, but where the order of rows is important, use `ROWS FROM () WITH ORDINALITY` to generate a row index like this:

  ```sql
  -- BLOCK insert_data
  INSERT INTO
    my_table (a, b, order_by)
  SELECT
    *
  FROM
    ROWS
  FROM
    (jsonb_to_recordset($data) AS (a INTEGER, b TEXT))
  WITH
    ORDINALITY AS data (a, b, order_by);
  ```

## Asynchronous control flow in JavaScript

- New code in PrairieLearn should use async/await whenever possible.

- Older code in PrairieLearn uses the traditional [Node.js error handling conventions](https://docs.nodejitsu.com/articles/errors/what-are-the-error-conventions/) with the `callback(err, result)` pattern.

- Use the [async library](http://caolan.github.io/async/) for complex control flow. Versions 3 and higher of `async` support both async/await and callback styles.

## Using async route handlers with ExpressJS

- Express can't directly use async route handlers. Instead we use [express-async-handler](https://www.npmjs.com/package/express-async-handler) like this:

  ```javascript
  const asyncHandler = require('express-async-handler');
  router.get(
    '/',
    asyncHandler(async (req, res, next) => {
      // can use "await" here
    }),
  );
  ```

## Interfacing between callback-style and async/await-style functions

- To write a callback-style function that internally uses async/await code, use this pattern:

  ```javascript
  const util = require('util');
  function oldFunction(x1, x2, callback) {
      util.callbackify(async () => {
          # here we can use async/await code
          y1 = await f(x1);
          y2 = await f(x2);
          return y1 + y2;
      })(callback);
  }
  ```

- To write a multi-return-value callback-style function that internally uses async/await code, we don't currently have an established pattern.

- To call our own library functions from async/await code, we should provide a version of them with "Async" appended to the name:

  ```
  const util = require('util');
  module.exports.existingLibFun = (x1, x2, callback) => {
      callback(null, x1*x2);
  };
  module.exports.existingLibFunAsync = util.promisify(module.exports.myFun);

  # in `async` code we can now call existingLibFunAsync() directly with `await`:
  async function newFun(x1, x2) {
      let y = await existingLibFunAsync(x1, x2);
      return 3*y;
  }
  ```

- If our own library functions use multiple return values, then the async version of them should return an object:

  ```
  const util = require('util');
  module.exports.existingMultiFun = (x, callback) => {
      const y1 = x*x;
      const y2 = x*x*x;
      callback(null, y1, y2); # note the two return values here
  };
  module.exports.existingMultiFunAsync = util.promisify((x, callback) =>
      module.exports.existingMultiFun(x, (err, y1, y2) => callback(err, {y1, y2}))
  );

  async function newFun(x) {
      let {y1, y2} = await existingMultiFunAsync(x); # must use y1,y2 names here
      return y1*y2;
  }
  ```

- To call a callback-style function in an external library from within an async/await function, use this pattern:

  ```javascript
  util = require('util');
  async function g(x) {
    x1 = await f(x + 2);
    x2 = await f(x + 4);
    z = await util.promisify(oldFunction)(x1, x2);
    return z;
  }
  ```

- As of 2019-08-15 we are not calling any multi-return-value callback-style functions in external libraries from within async/await functions, but if we need to do this then we could include the `bluebird` package and use the pattern:

  ```javascript
  bluebird = require('bluebird');
  function oldMultiFunction(x, callback) {
      return callback(null, x*x, x*x*x);
  }
  async function g(x) {
      let [y1, y2] = await bluebird.promisify(oldMultiFunction, {multiArgs: true})(x); # note array destructuring with y1,y2
      return y1*y2;
  }
  ```

- To call an async/await function from within a callback-style function, use this pattern:

  ```javascript
  util = require('util');
  function oldFunction(x, callback) {
    util.callbackify(g)(x, (err, y) => {
      if (ERR(err, callback)) return;
      callback(null, y);
    });
  }
  ```

- To call an multi-return-value async/await function from within a callback-style function, use this pattern:

  ```javascript
  util = require('util');
  async function gMulti(x) {
      y1 = x*x;
      y2 = x*x*x;
      return {y1, y2};
  }
  function oldFunction(x, callback) {
      util.callbackify(gMulti)(x, (err, {y1, y2}]) => {
          if (ERR(err, callback)) return;
          callback(null, y1*y2);
      });
  }
  ```

## Stack traces with callback-style functions

- Use the [async-stacktrace library](https://github.com/Pita/async-stacktrace) for every error handler. That is, the top of every file should have `ERR = require('async-stacktrace');` and wherever you would normally write `if (err) return callback(err);` you instead write `if (ERR(err, callback)) return;`. This does exactly the same thing, except that it modifies the `err` object's stack trace to include the current filename/linenumber, which greatly aids debugging. For example:

  ```javascript
  // Don't do this:
  function foo(p, callback) {
    bar(q, function (err, result) {
      if (err) return callback(err);
      callback(null, result);
    });
  }

  // Instead do this:
  ERR = require('async-stacktrace'); // at top of file
  function foo(p, callback) {
    bar(q, function (err, result) {
      if (ERR(err, callback)) return; // this is the change
      callback(null, result);
    });
  }
  ```

- Don't pass `callback` functions directly through to children, but instead capture the error with the [async-stacktrace library](https://github.com/Pita/async-stacktrace) and pass it up the stack explicitly. This allows a complete stack trace to be printed on error. That is:

  ```javascript
  // Don't do this:
  function foo(p, callback) {
    bar(q, callback);
  }

  // Instead do this:
  function foo(p, callback) {
    bar(q, function (err, result) {
      if (ERR(err, callback)) return;
      callback(null, result);
    });
  }
  ```

- Note that the [async-stacktrace library](https://github.com/Pita/async-stacktrace) `ERR` function will throw an exception if not provided with a callback, so in cases where there is no callback (e.g., in `cron/index.js`) we should call it with `ERR(err, function() {})`.

- If we are in a function that does not have an active callback (perhaps we already called it) then we should log errors with the following pattern. Note that the first string argument to `logger.error()` is mandatory. Failure to provide a string argument will result in `error: undefined` being logged to the console.

  ```javascript
  function foo(p) {
      bar(p, function(err, result) {
          if (ERR(err, e => logger.error('Error in bar()', e);
          ...
      });
  }
  ```

- Don't call a `callback` function inside a try block, especially if there is also a `callback` call in the catch handler. Otherwise exceptions thrown much later will show up incorrectly as a double-callback or just in the wrong place. For example:

  ```javascript
  // Don't do this:
  function foo(p, callback) {
    try {
      let result = 3;
      callback(null, result); // this could throw an error from upstream code in the callback
    } catch (err) {
      callback(err);
    }
  }

  // Instead do this:
  function foo(p, callback) {
    let result;
    try {
      result = 3;
    } catch (err) {
      callback(err);
    }
    callback(null, result);
  }
  ```

## Security model

- We distinguish between [authentication and authorization](https://en.wikipedia.org/wiki/Authentication#Authorization). Authentication occurs as the first stage in server response and the authenticated user data is stored as `res.locals.authn_user`.

- The authentication flow is:

  1. We first redirect to a remote authentication service (either Shibboleth or Google OAuth2 servers). For Shibboleth this happens by the “Login to PL” button linking to `/pl/shibcallback` for which Apache handles the Shibboleth redirections. For Google the “Login to PL” button links to `/pl/auth2login` which sets up the authentication data and redirects to Google.

  2. The remote authentication service redirects back to `/pl/shibcallback` (for Shibboleth) or `/pl/auth2callback` (for Google). These endpoints confirm authentication, create the user in the `users` table if necessary, set a signed `pl_authn` cookie in the browser with the authenticated `user_id`, and then redirect to the main PL homepage. This cookie is set with the `HttpOnly` attribute, which prevents client-side JavaScript from reading the cookie.

  3. Every other page authenticates using the signed browser `pl_authn` cookie. This is read by [`middlewares/authn.js`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/middlewares/authn.js) which checks the signature and then loads the user data from the DB using the `user_id`, storing it as `res.locals.authn_user`.

- Similar to unix, we distinguish between the real and effective user. The real user is stored as `res.locals.authn_user` and is the user that authenticated. The effective user is stored as `res.locals.user`. Only users with `role = TA` or higher can set an effective user that is different from their real user. Moreover, users with `role = TA` or higher can also set an effective `role` and `mode` that is different to the real values.

- Authorization occurs at multiple levels:

  - The `course_instance` checks authorization based on the `authn_user`.

  - The `course_instance` authorization is checked against the effective `user`.

  - The `assessment` checks authorization based on the effective `user`, `role`, `mode`, and `date`.

- All state-modifying requests must (normally) be POST and all associated data must be in the body. GET requests may use query parameters for viewing options only.

## State-modifying POST requests

- Use the [Post/Redirect/Get](https://en.wikipedia.org/wiki/Post/Redirect/Get) pattern for all state modification. This means that the initial GET should render the page with a `<form>` that has no `action` set, so it will submit back to the current page. This should be handled by a POST handler that performs the state modification and then issues a redirect back to the same page as a GET:

  ```javascript
  router.post('/', function (req, res, next) {
    if (req.body.__action == 'enroll') {
      var params = {
        course_instance_id: req.body.course_instance_id,
        user_id: res.locals.authn_user.user_id,
      };
      sqldb.queryOneRow(sql.enroll, params, function (err, result) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    } else {
      return next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  });
  ```

- To defeat [CSRF (Cross-Site Request Forgery)](https://en.wikipedia.org/wiki/Cross-site_request_forgery) we use the [Encrypted Token Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). This stores an [HMAC-authenticated token](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code) inside the POST data.

- All data modifying requests should come from `form` elements like:

  ```html
  <form name="enroll-form" method="POST">
    <input type="hidden" name="__action" value="enroll" />
    <input type="hidden" name="__csrf_token" value="<%= __csrf_token %>" />
    <input type="hidden" name="course_instance_id" value="56" />
    <button type="submit" class="btn btn-info">Enroll in course instance 56</button>
  </form>
  ```

- The `res.locals.__csrf_token` variable is set and checked by early-stage middleware, so no explicit action is needed on each page.

## Logging errors

- We use [Winston](https://github.com/winstonjs/winston) for logging to the console and to files. To use this, require `lib/logger` and call `logger.info()`, `logger.error()`, etc.

- To show a message on the console, use `logger.info()`.

- To log just to the log files, but not to the console, use `logger.verbose()`.

- All `logger` functions have a mandatory first argument that is a string, and an optional second argument that is an object containing useful information. It is important to always provide a string as the first argument.

## Coding style

[ESLint](http://eslint.org/) and [Prettier](https://prettier.io/) are used to enforce consistent code conventions and formatting throughout the codebase. See `.eslintrc.js` and `.prettierrc.json` in the root of the PrairieLearn repository to view our specific configuration. The repo includes an [`.editorconfig`](https://editorconfig.org/) file that most editors will detect and use to automatically configure things like indentation. If your editor doesn't natively support an EditorConfig file, there are [plugins](https://editorconfig.org/#download) available for most other editors.

For Python files, [Black](https://black.readthedocs.io/en/stable/), [isort](https://pycqa.github.io/isort/), and [flake8](https://flake8.pycqa.org/en/latest/) are used to enforce code conventions, and [Pyright](https://github.com/microsoft/pyright) is used for static typechecking. See `pyproject.toml` in the root of the PrairieLearn repository to view our specific configuration. We encourage all new Python code to include type hints for use with the static typechecker, as this makes it easier to read, review, and verify contributions.

To lint the code, use `make lint`. This is also run by the CI tests.

To automatically fix lint and formatting errors, run `make format`.

## Question-rendering control flow

- The core files involved in question rendering are [lib/question-render.js](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/lib/question-render.js), [lib/question-render.sql](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/lib/question-render.sql), and [pages/partials/question.ejs](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/pages/partials/question.ejs).

- The above files are all called/included by each of the top-level pages that needs to render a question (e.g., `pages/instructorQuestionPreview`, `pages/studentInstanceQuestion`, etc). Unfortunately the control-flow is complicated because we need to call `lib/question-render.js` during page data load, store the data it generates, and then later include the `pages/partials/question.ejs` template to actually render this data.

- For example, the exact control-flow for `pages/instructorQuestion` is:

  1. The top-level page `pages/instructorQuestion/instructorQuestion.js` code calls `lib/question-render.getAndRenderVariant()`.

  2. `getAndRenderVariant()` inserts data into `res.locals` for later use by `pages/partials/question.ejs`.

  3. The top-level page code renders the top-level template `pages/instructorQuestion/instructorQuestion.ejs`, which then includes `pages/partials/question.ejs`.

  4. `pages/partials/question.ejs` renders the data that was earlier generated by `lib/question-render.js`.

## Question open status

- There are three levels at which “open” status is tracked, as follows. If `open = false` for any object then it will block the creation of new objects below it. For example, to create a new submission the corresponding variant, instance_question, and assessment_instance must all be open.

  | Variable                   | Allow new `instance_questions` | Allow new `variants` | Allow new `submissions` |
  | -------------------------- | ------------------------------ | -------------------- | ----------------------- |
  | `assessment_instance.open` | ✓                              | ✓                    | ✓                       |
  | `instance_question.open`   |                                | ✓                    | ✓                       |
  | `variant.open`             |                                |                      | ✓                       |

## Errors in question handling

- We distinguish between two different types of student errors:

  1. The answer might be not be gradable (`submission.gradable = false`). This could be due to a missing answer, an invalid format (e.g., entering a string in a numeric input), or a answer that doesn't pass some basic check (e.g., a code submission that didn't compile). This can be discovered during either the parsing or grading phases. In such a case the `submission.format_errors` object should store information on what was wrong to allow the student to correct their answer. A submission with `gradable = false` will not cause any updating of points for the question. That is, it acts like a saved-but-not-graded submission, in that it is recorded but has no impact on the question. If `gradable = false` then the `score` and `feedback` will not be displayed to the student.

  2. The answer might be gradable but incorrect. In this case `submission.gradable = true` but `submission.score = 0` (or less than 1 for a partial score). If desired, the `submission.feedback` object can be set to give information to the student on what was wrong with their answer. This is not necessary, however. If `submission.feedback` is set then it will be shown to the student along with their `submission.score` as soon as the question is graded.

- There are three levels of errors that can occur during the creation, answering, and grading of a question:

  | Error level     | Caused                                                           | Stored                                                                                    | Reported                             | Effect                                                                                                                                                                     |
  | --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | System errors   | Internal PrairieLearn errors                                     | On-disk logs                                                                              | Error page                           | Operation is blocked. Data is not saved to the database.                                                                                                                   |
  | Question errors | Errors in question code                                          | `issues` table                                                                            | Issue panels on the question page    | `variant.broken_at != null` or `submission.broken == true`. Operation completes, but future operations are blocked.                                                        |
  | Student errors  | Invalid data submitted by the student (unparsable or ungradable) | `submission.gradable` set to `false` and details are stored in `submission.format_errors` | Inside the rendered submission panel | The submission is not assigned a score and no further action is taken (e.g., points are changed for the instance question). The student can resubmit to correct the error. |

- The important variables involved in tracking question errors are:

  | Variable                   | Error level    | Description                                                                                                                                                                                           |
  | -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `variant.broken_at`        | Question error | Set to `NOW()` if there were question code errors in generating the variant. Such a variant will be not have `render()` functions called, but will instead be displayed as `This question is broken`. |
  | `submission.broken`        | Question error | Set to `true` if there question code errors in parsing or grading the variant. After `submission.broken` is `true`, no further actions will be taken with the submission.                             |
  | `issues` table             | Question error | Rows are inserted to record the details of the errors that caused `variant.broken != null` or `submission.broken == true` to be set to `true`.                                                        |
  | `submission.gradable`      | Student error  | Whether this submission can be given a score. Set to `false` if format errors in the `submitted_answer` were encountered during either parsing or grading.                                            |
  | `submission.format_errors` | Student error  | Details on any errors during parsing or grading. Should be set to something meaningful if `gradable = false` to explain what was wrong with the submitted answer.                                     |
  | `submission.graded_at`     | None           | NULL if grading has not yet occurred, otherwise a timestamp.                                                                                                                                          |
  | `submission.score`         | None           | Final score for the submission. Only used if `gradable = true` and `graded_at` is not NULL.                                                                                                           |
  | `submission.feedback`      | None           | Feedback generated during grading. Only used if `gradable = true` and `graded_at` is not NULL.                                                                                                        |

- Note that `submission.format_errors` stores information about student errors, while the `issues` table stores information about question code errors.

- The question flow is shown in the diagram below (also as a [PDF image](question-flow.pdf)).

  ![Question flow](question-flow.png)

## JavaScript equality operator

You should almost always use the `===` operator for comparisons; this is enforced with an ESLint rule.

The only case where the `==` operator is frequently useful is for comparing entity IDs that may be coming from the client/database/etc. These may be either strings or numbers depending on where they're coming from or how they're fetched. To make it abundantly clear that ids are being compared, you should use the `idsEqual` utility:

```js
const { idsEqual } = require('./lib/id');

console.log(idsEqual(12345, '12345'));
// > true
```

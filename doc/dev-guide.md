
# Developer Guide

In general we prefer simplicity. We standardize on JavaScript (Node.js) and SQL (PostgreSQL) as the languages of implementation and try to minimize the number of complex libraries or frameworks being used. The website is server-side generated pages with minimal client-side JavaScript.

## High level view

![High level system structure](high-level.png)

* The questions and assessments for a course are stored in a git repository. This is synced into the database by the course instructor and DB data is updated or added to represent the course. Students then interact with the course website by doing questions, with the results being stored in the DB. The instructor can view the student results on the website and download CSV files with the data.

* All course configuration is done via plain text files in the git repository, which is the master source for this data. There is no extra course configuration stored in the DB. The instructor does not directly edit course data via the website.

* All student data is all stored in the DB and is not pushed back into the git repository or disk at any point.

## Directory layout

* Broadly follow the [Express generator](http://expressjs.com/en/starter/generator.html) layout.

* Top-level files and directories are:

```text
PrairieLearn/v2
+-- autograder         # files needed to autograde code on a seperate server
|   `-- ...            # various scripts and docker images
+-- config.json        # server configuration file (optional)
+-- cron               # jobs to be periodically executed, one file per job
|   +-- index.js       # entry point for all cron jobs
|   `-- ...            # one JS file per cron job, executed by index.js
+-- doc                # documentation
+-- exampleCourse      # example content for a course
+-- lib                # miscellaneous helper code
+-- middlewares        # Express.js middleware, one per file
+-- models             # DB table creation, one file per table
|   +-- index.js       # entry point for all model initialization
|   `-- ...            # one JS file per table, executed by index.js
+-- package.json       # npm configuration file
+-- pages              # one sub-dir per web page
|   +-- partials       # EJS helper sub-templates
|   +-- instructorHome # all the code for the instructorHome page
|   +-- userHome       # all the code for the userHome page
|   `-- ...            # other "instructor" and "user" pages
+-- public             # all accessible without access control
|   +-- javascripts    # external packages only, no modificiations
|   +-- localscripts   # all local site-wide JS
|   `-- stylesheets    # all CSS, both external and local
+-- question-servers   # one file per question type
+-- schemas            # JSON schemas for input file formats
+-- server.js          # top-level program
+-- sprocs             # DB stored procedures, one per file
|   +-- index.js       # entry point for all sproc initialization
|   `-- ...            # one JS file per sproc, executed by index.js
+-- sync               # code to load on-disk course config into DB
`-- tests              # unit tests, currently unused
```


## Page generation

* Use [Express](http://expressjs.com) as the web framework. As of 2016-09-27 we are using v4.

* All pages are server-side rendered and we try and minimize the amount of client-side JavaScript. Client-side JS should use [jQuery](https://jquery.com) and related libraries. We prefer to use off-the-shelf jQuery plugins where possible.

* Each web page typically has all its files in a single directory, with the directory, the files, and the URL all named the same. Not all pages need all files. For example:

```text
pages/instructorGradebook
+-- instructorGradebook.js         # main entry point, calls the SQL and renders the template
+-- instructorGradebook.sql        # all SQL code specific to this page
+-- instructorGradebook.ejs        # the EJS template for the page
`-- instructorGradebookClient.js   # any client-side JS needed
```

* The above `instructorGradebook` page is loaded from the top-level `server.js` with:

```javascript
app.use('/instructor/:courseInstanceId/gradebook', require('./pages/instructorGradebook/instructorGradebook'));
```

* The `instructorGradebook.js` main JS file is an Express `router` and has the basic structure:

```javascript
var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {course_instance_id: res.params.courseInstanceId};
    sqldb.query(sql.user_scores, params, function(err, result) { // SQL queries for page data
        if (ERR(err, next)) return;
        res.locals.user_scores = result.rows; // store the data in res.locals

        res.render('pages/instructorGradebook/instructorGradebook', res.locals); // render the page
        // inside the EJS template, "res.locals.var" can be accessed with just "var"
    });
});

module.exports = router;
```

* Use the `res.locals` variable to build up data for the page rendering. Many basic objects are already included from the `selectAndAuthz*.js` middleware that runs before most page loads.

* Use [EJS templates](http://ejs.co) (Embedded JavaScript) templates for all pages. Using JS as the templating language removes the need for another ad hoc language, but does require some discipline to not get in a mess. Try and minimize the amount of JS code in the template files. Inside a template the JS code can directly access the contents of the `res.locals` object.

* Sub-templates are stored in `pages/partials` and can be loaded as below. The sub-template can also access `res.locals` as its base scope, and can also accept extra arguments with an arguments object:

```javascript
<%- include('../partials/assessment', {assessment: assessment}); %>
```

## Page style

* Use [Bootstrap](http://getbootstrap.com) as the style. As of 2016-09-27 we are using v3.

* Local CSS rules go in `public/stylesheets/local.css`. Try to minimize use of this and use plain Bootstrap styling.

## SQL usage

* Use [PostgreSQL](https://www.postgresql.org) and feel free to use the latest features. As of 2016-09-26 we run version 9.5.

* The [PostgreSQL manual](https://www.postgresql.org/docs/manuals/) is an excellent reference.

* Write raw SQL rather than using a [ORM library](https://en.wikipedia.org/wiki/Object-relational_mapping). This reduces the number of frameworks/languages needed.

* Try and write as much code in SQL and [PL/pgSQL](https://www.postgresql.org/docs/9.5/static/plpgsql.html) as possible, rather than in JavaScript. Use PostgreSQL-specific SQL and don't worry about SQL dialect portability. Functions should be written as stored procedures in the `sprocs/` directory.

* Use the SQL convention of [`snake_case`](https://en.wikipedia.org/wiki/Snake_case) for names. Also use the same convention in JavaScript for names that are the same as in SQL, so the `question_id` variable in SQL is also called `question_id` in JavaScript code.

* Use uppercase for SQL reserved words like `SELECT`, `FROM`, `AS`, etc.

* SQL code should not be inline in JavaScript files. Instead it should be in a separate `.sql` file, following the [Yesql concept](https://github.com/krisajenkins/yesql). Each `filename.js` file will normally have a corresponding `filename.sql` file in the same directory. The `.sql` file should look like:

```sql
-- BLOCK select_question
SELECT * FROM questions WHERE id = $question_id;

-- BLOCK insert_submission
INSERT INTO submissions (submitted_answer) VALUES ($submitted_answer) RETURNING *;
```

From JavaScript you can then do:

```javascript
var sqlLoader = require('./sql-loader'); // adjust path as needed
var sql = sqlLoader.loadSqlEquiv(__filename); // from filename.js will load filename.sql

// run the entire contents of the SQL file
sqldb.query(sql.all, params, ...);

// run just one query block from the SQL file
sqldb.query(sql.select_question, params, ...);
```

* The layout of the SQL code should generally have each list in separate indented blocks, like:

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

* To keep SQL code organized it is a good idea to use [CTEs (`WITH` queries)](https://www.postgresql.org/docs/current/static/queries-with.html). These are formatted like:

```sql
WITH first_preliminary_table AS (
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

## DB schema

* See the [list of DB tables](https://github.com/PrairieLearn/PrairieLearn/blob/master/models/), with the ER (entity relationship) diagram below ([PDF ER diagram](models.pdf)).

![DB Schema](models.png)

* Tables have plural names (e.g. `assessments`) and always have a primary key called `id`. The foreign keys pointing to this table are non-plural, like `assessment_id`. When referring to this use an abbreviation of the first letters of each word, like `ai` in this case. The only exceptions are `aset` for `assessment_sets` (to avoid conflicting with the SQL `AS` keyword), `top` for `topics`, and `tag` for `tags` (to avoid conflicts). This gives code like:

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

* We (almost) never delete student data from the DB. To avoid having rows with broken or missing foreign keys, course configuration tables (e.g. `assessments`) can't be actually deleted. Instead they are "soft-deleted" by setting the `deleted_at` column to non-NULL. This means that when using any soft-deletable table we need to have a `WHERE deleted_at IS NULL` to get only the active rows.

## DB schema migrations

* We use a split system for DB creation/migration consisting of the `models/` and `migrations/` directories:

    * The `models/` directory contains `CREATE` statements will create the current up-to-date state of the DB. These are useful as a reference for the current state of the DB.

    * The `migrations/` directory contains statements that will upgrade a DB to the current state. Files matching `*.sql` in this directory will be run in alphabetic order.

* All statements in `models/` and `migrations/` must be [idempotent](https://en.wikipedia.org/wiki/Idempotence). On server start, first all SQL files in `models/` are executed, and then all files in `migrations/`.

* Migration statements start with PrairieLearn version 2.0.0.

* The filenames in `migrations/` are of the form `<nnn>_<description>.sql` where `<nnn>` is a number to ensure ordering. There is no need for files to have distinct leading numbers if their order is unimportant. A suggested form for the `<description>` is `<table name>__<column name>__<operation>` if only a single column is being changed. It's fine to put multiple logically-related migration statements in the same file.

* Some useful migration statements follow.

* To add a column to a table:

```sql
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS auto_close boolean DEFAULT true;
```

* Do not put constraints (like `UNIQUE` or `REFERENCES`) on an `ADD COLUMN` statement, otherwise it will add a new index every time it runs, even if the statement has `IF NOT EXISTS`. See below for how to add a foreign keys or other constraints without using the `ADD COLUMN` statement.

* To add a foreign key to a table, the migration queries need to be wrapped like:

```sql
ALTER TABLE variants ADD COLUMN IF NOT EXISTS authn_user_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'variants_authn_user_id_fkey'
        )
        THEN
        ALTER TABLE variants ADD FOREIGN KEY (authn_user_id) REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;
```

* To remove a constraint use:

    ```sql
    ALTER TABLE alternative_groups DROP CONSTRAINT IF EXISTS alternative_groups_number_assessment_id_key;
    ```

* To add a constraint use:

```sql
DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'alternative_groups_assessment_id_number_key'
        )
        THEN
        ALTER TABLE alternative_groups ADD UNIQUE (assessment_id, number);
    END IF;
END;
$$;
```


## Database access

* DB access is via the `sqldb.js` module. This wraps the [node-postgres](https://github.com/brianc/node-postgres) library.

* For single queries we normally use the following pattern, which automatically uses connection pooling from node-postgres and safe variable interpolation with named parameters and [prepared statements](https://github.com/brianc/node-postgres/wiki/Parameterized-queries-and-Prepared-Statements):

```javascript
var params = {
    course_id: 45,
};
sqldb.query(sql.select_questions_by_course, params, function(err, result) {
    if (ERR(err, callback)) return;
    var questions = result.rows;
});
```

Where the corresponding `filename.sql` file contains:

```sql
-- BLOCK select_questions_by_course
SELECT * FROM questions WHERE course_id = $course_id;
```

* For queries where it would be an error to not return exactly one result row:

```javascript
sqldb.queryOneRow(sql.block_name, params, function(err, result) {
    if (ERR(err, callback)) return;
    var obj = result.rows[0]; // guaranteed to exist and no more
});
```

* For transactions with correct error handling use the pattern:

```javascript
sqldb.beginTransaction(function(err, client, done) {
    if (ERR(err, callback)) return;
    async.series([
        function(callback) {
            // only use queryWithClient() and queryWithClientOneRow() inside the transaction
            sqldb.queryWithClient(client, sql.block_name, params, function(err, result) {
                if (ERR(err, callback)) return;
                // do things
                callback(null);
            });
        },
        // more series functions inside the transaction
    ], function(err) {
        sqldb.endTransaction(client, done, err, function(err) { // will rollback if err is defined
            if (ERR(err, callback)) return;
            // transaction successfully committed at this point
            callback(null);
        });
    });
});
```

* Use explicit row locking on `assessment_instances` within a transaction for any score-modifying updates to any part of an assessment. For example, to grade a question, wrap everything in a transaction as described above and have the first query in the transaction be something like:

```sql
SELECT
    ai.id
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id
FOR UPDATE OF assessment_instances;
```

* To pass an array of parameters to SQL code, use the following pattern, which allows zero or more elements in the array. This replaces `$points_list` with `ARRAY[10, 5, 1]` in the SQL. It's required to specify the type of array in case it is empty:

```javascript
var params = {
    points_list: [10, 5, 1],
};
sqldb.query(sql.insert_assessment_question, params, ...);
```

```sql
-- BLOCK insert_assessment_question
INSERT INTO assessment_questions (points_list) VALUES ($points_list::INTEGER[]);
```

* To use a JavaScript array for membership testing in SQL use [`unnest()`](https://www.postgresql.org/docs/9.5/static/functions-array.html) like:

```javascript
var params = {
    id_list: [7, 12, 45],
};
sqldb.query(sql.select_questions, params, ...);
```

```sql
-- BLOCK select_questions
SELECT * FROM questions WHERE id IN (SELECT unnest($id_list::INTEGER[]));
```

## Error handling and control flow in JavaScript

* Use tradtional [Node.js error handling conventions](https://docs.nodejitsu.com/articles/errors/what-are-the-error-conventions/) with the `callback(err, result)` pattern.

* Use the [async library](http://caolan.github.io/async/) for control flow.

* Use the [async-stacktrace library](https://github.com/Pita/async-stacktrace) for every error handler. That is, the top of every file should have `ERR = require('async-stacktrace');` and wherever you would normally write `if (err) return callback(err);` you instead write `if (ERR(err, callback)) return;`. This does exactly the same thing, except that it modfies the `err` object's stack trace to include the current filename/linenumber, which greatly aids debugging. For example:

```javascript
// Don't do this:
function foo(p, callback) {
    bar(q, function(err, result) {
        if (err) return callback(err);
        callback(null, result);
    });
}

// Instead do this:
ERR = require('async-stacktrace'); // at top of file
function foo(p, callback) {
    bar(q, function(err, result) {
        if (ERR(err, callback)) return; // this is the change
        callback(null, result);
    });
}
```

* Don't pass `callback` functions directly through to children, but instead capture the error with [async-stacktrace library](https://github.com/Pita/async-stacktrace) and pass it up the stack explicitly. This allows a complete stack trace to be printed on error. That is:

```javascript
// Don't do this:
function foo(p, callback) {
    bar(q, callback);
}

// Instead do this:
function foo(p, callback) {
    bar(q, function(err, result) {
        if (ERR(err, callback)) return;
        callback(null, result);
    });
}
```

* Note that the [async-stacktrace library](https://github.com/Pita/async-stacktrace) `ERR` function will throw an exception if not provided with a callback, so in cases where there is no callback (e.g., in `cron/index.js`) we should call it with `ERR(err, function() {})`.

* Don't use promises.

* We will switch to [async/await](https://github.com/tc39/ecmascript-asyncawait) when it becomes available in Node.js. The async/await proposal made it to [stage 4](https://github.com/tc39/proposals/blob/master/finished-proposals.md) in July 2016 and was thus included in the [latest draft Ecmascript spec](https://tc39.github.io/ecma262/). This will appear as ES2017/ES7. V8 [merged support](https://bugs.chromium.org/p/v8/issues/detail?id=4483) for async/await. Node.js is [tracking its implementation](https://github.com/nodejs/promises/issues/4) but as of 2016-09-26 it looks like there is still work needed.


## Security model

* We distinguish between [authentication and authorization](https://en.wikipedia.org/wiki/Authentication#Authorization). Authentication occurs as the first stage in server response and the authenicated user data is stored as `res.locals.authn_user`.

* Similar to unix, we distinguish between the real and effective user. The real user is stored as `res.locals.authn_user` and is the user that authenticated. The effective user is stored as `res.locals.user`. Only users with `role = TA` or higher can set an effective user that is different from their real user. Moreover, users with `role = TA` or higher can also set an effective `role` and `mode` that is different to the real values.

* Authorization occurs at multiple levels:

    * The `course_instance` checks authorization based on the `authn_user`.

    * The `course_instance` authorization is checked against the effective `user`.

    * The `assessment` checks authorization based on the effective `user`, `role`, `mode`, and `date`.

* All state-modifying requests must (normally) be POST and all associated data must be in the body. GET requests may use query parameters for viewing options only.


## State-modifying POST requests

* Use the [Post/Redirect/Get](https://en.wikipedia.org/wiki/Post/Redirect/Get) pattern for all state modification. This means that the initial GET should render the page with a `<form>` that has no `action` set, so it will submit back to the current page. This should be handled by a POST handler that performs the state modification and then issues a redirect back to the same page as a GET:

```javascript
router.post('/', function(req, res, next) {
    if (req.body.postAction == 'enroll') {
        var params = {
            course_instance_id: req.body.course_instance_id,
            user_id: res.locals.authn_user.id,
        };
        sqldb.queryOneRow(sql.enroll, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {body: req.body, locals: res.locals}));
    }
});
```

* To defeat [CSRF (Cross-Site Request Forgery)](https://en.wikipedia.org/wiki/Cross-site_request_forgery) we use the [Encrypted Token Pattern](https://www.owasp.org/index.php/Cross-Site_Request_Forgery_%28CSRF%29_Prevention_Cheat_Sheet). This stores an [HMAC-authenticated token](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code) inside the POST data.

* All data modifying requests should come from `form` elements like:

```html
<form name="enroll-form" method="POST">
    <input type="hidden" name="postAction" value="enroll">
    <input type="hidden" name="csrfToken" value="<%= csrfToken %>">
    <input type="hidden" name="course_instance_id" value="56">
    <button type="submit" class="btn btn-info">
        Enroll in course instance 56
    </button>
</form>
```

* The `res.locals.csrfToken` variable is set and checked by early-stage middleware, so no explicit action is needed on each page.

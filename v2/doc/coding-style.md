
# Coding Style

In general we prefer simplicity. We standardize on JavaScript (Node.js) and SQL (PostgreSQL) as the languages of implementation and try to minimize the number of complex libraries or frameworks being used.

## SQL usage

1. Use [PostgreSQL](https://www.postgresql.org) and feel free to use the latest features. As of 2016-09-26 we run version 9.5.

1. The [PostgreSQL manual](https://www.postgresql.org/docs/manuals/) is an excellent reference.

1. Write raw SQL rather than using a [ORM library](https://en.wikipedia.org/wiki/Object-relational_mapping). This reduces the number of frameworks/languages needed.

1. Try and write as much code in SQL and [PL/pgSQL](https://www.postgresql.org/docs/9.5/static/plpgsql.html) as possible, rather than in JavaScript. Use PostgreSQL-specific SQL and don't worry about SQL dialect portability. Functions should be written as stored procedures in the `sprocs/` directory.

1. Use the SQL convention of [`snake_case`](https://en.wikipedia.org/wiki/Snake_case) for names. Also use the same convention in JavaScript for names that are the same as in SQL, so the `question_id` variable in SQL is also called `question_id` in JavaScript code.

1. SQL code should not be inline in JavaScript files. Instead it should be in a separate `.sql` file, following the [Yesql concept](https://github.com/krisajenkins/yesql). Each `filename.js` file will normally have a corresponding `filename.sql` file in the same directory. The `.sql` file should look like:

        -- BLOCK: select_question
        SELECT * FROM questions WHERE id = $question_id;

        -- BLOCK: insert_submission
        INSERT INTO submissions (submitted_answer) VALUES ($submitted_answer) RETURNING *;

    From JavaScript you can then do:

        var sqlLoader = require('./sql-loader'); # adjust path as needed
        var sql = sqlLoader.loadSqlEquiv(__filename); # from filename.js will load filename.sql

        # run the entire contents of the SQL file
        sqldb.query(sql.all, params, ...);

        # run just one query block from the SQL file
        sqldb.query(sql.select_question, params, ...);


## Database access

1. DB access is via the `sqldb.js` module. This wraps the [node-postgres](https://github.com/brianc/node-postgres) library.

1. For single queries we normally use the following pattern, which automatically uses connection pooling from node-postgres and safe variable interpolation with named parameters and [prepared statements](https://github.com/brianc/node-postgres/wiki/Parameterized-queries-and-Prepared-Statements):

        var params = {
            course_id: 45,
        };
        sqldb.query(sql.select_questions_by_course, params, function(err, result) {
            if (ERR(err, callback)) return;
            var questions = result.rows;
        });

    Where the corresponding `filename.sql` file contains:

        -- BLOCK: select_questions_by_course
        SELECT * FROM questions WHERE course_id = $course_id;

1. For queries where it would be an error to not return exactly one result row:

        sqldb.queryOneRow(sql.block_name, params, function(err, result) {
            if (ERR(err, callback)) return;
            var obj = result.rows[0]; // guaranteed to exist and no more
        });

1. For transactions with correct error handling use this pattern:

        sqldb.beginTransaction(function(err, client, done) {
            if (ERR(err, callback)) return;
            async.series([
                function(callback) {
                    sqldb.queryWithClient(client, sql.block_name, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        // do things
                        callback(null);
                    });
                },
                // more series functions inside the transaction
            ], function(err) {
                sqldb.endTransaction(client, done, err, function(err) {
                    if (ERR(err, callback)) return;
                    // transaction successfully committed at this point
                    callback(null);
                });
            });
        });

1. To pass an array of parameters to SQL code, use the following pattern, which allows zero or more elements in the array. It's required to specify the type of array in case it is empty:

        var params = {
            points_list: [10, 5, 1],
        };
        sqldb.query(sql.insert_assessment_question, params, ...);


        -- BLOCK: insert_assessment_question
        INSERT INTO assessment_questions (points_list) VALUES ($points_list::INTEGER[]);

1. To use a JavaScript array for membership testing in SQL do:

        var params = {
            id_list: [7, 12, 45],
        };
        sqldb.query(sql.select_questions, params, ...);


        -- BLOCK: select_questions
        SELECT * FROM questions WHERE id IN (SELECT unnest($id_list::INTEGER[]));

## Error handling and control flow in JavaScript

1. Use tradtional [Node.js error handling conventions](https://docs.nodejitsu.com/articles/errors/what-are-the-error-conventions/) with the `callback(err, result)` pattern.

1. Use the [async library](http://caolan.github.io/async/) for control flow.

1. Use the [async-stacktrace library](https://github.com/Pita/async-stacktrace) for every error handler. That is, the top of every file should have `ERR = require('async-stacktrace');` and wherever you would normally write `if (err) return callback(err);` you instead write `if (ERR(err, callback)) return;`. This does exactly the same thing, except that it modfies the `err` object's stack trace to include the current filename/linenumber and greatly aid debugging. For example:

        # Don't do this:
        function foo(p, callback) {
            bar(q, function(err, result) {
                if (err) return callback(err);
                callback(null, result);
            });
        }

        # Instead do this:
        ERR = require('async-stacktrace'); # at top of file
        function foo(p, callback) {
            bar(q, function(err, result) {
                if (ERR(err, callback)) return; # this is the change
                callback(null, result);
            });
        }
1. Don't pass `callback` functions directly through to children, but instead capture the error and pass it up the stack explicitly. This allows a complete stack trace to be printed on error. That is:

        # Don't do this:
        function foo(p, callback) {
            bar(q, callback);
        }

        # Instead do this:
        function foo(p, callback) {
            bar(q, function(err, result) {
                if (ERR(err, callback)) return;
                callback(null, result);
            });
        }

1. Don't use promises.

1. We will switch to [async/await](https://github.com/tc39/ecmascript-asyncawait) when it becomes available in Node.js. The async/await proposal made it to [stage 4](https://github.com/tc39/proposals/blob/master/finished-proposals.md) in July 2016 and thus was included in the [latest draft Ecmascript spec](https://tc39.github.io/ecma262/). This will appear as ES2017/ES7. V8 [merged support](https://bugs.chromium.org/p/v8/issues/detail?id=4483) for async/await. Node.js is [tracking its implementation](https://github.com/nodejs/promises/issues/4) but as of 2016-09-26 it looks like there is still work needed.



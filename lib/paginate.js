const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');

const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {
    pages(chosenPage, count, pageSize) {
        let lastPage = Math.ceil(count / pageSize);
        if (lastPage == 0) lastPage = 1;

        let currPage = Number(chosenPage);
        if (!_.isInteger(currPage)) currPage = 1;

        let prevPage = currPage - 1;
        let nextPage = currPage + 1;

        currPage = Math.max(1, Math.min(lastPage, currPage));
        prevPage = Math.max(1, Math.min(lastPage, prevPage));
        nextPage = Math.max(1, Math.min(lastPage, nextPage));

        return {currPage, prevPage, nextPage, lastPage};
    },

    /**
     * Utility function to facilitate extremely large queries whose results
     * cannot fit in memory all at once. The given query must accept an "offset"
     * param that will be used to paginate the query. The "receiveRow" callback
     * will be called once for each row in the result set. The "done" callback
     * is called either if an error has occurred or when all rows have been
     * delivered.
     */
    paginateQuery(sql, params, receiveRow, done) {
        const _params = Object.assign({}, params);
        let offset = 0;
        async.doWhilst((callback) => {
            _params.offset = offset;
            sqldb.query(sql, _params, (err, result) => {
                if (ERR(err, callback)) return;
                async.eachSeries(result.rows, receiveRow, (err) => {
                    if (ERR(err, callback)) return;
                    offset += result.rows.length;
                    callback(null, result.rows.length);
                });
            });
        }, (count) => {
            return count > 0;
        }, (err) => {
            if (ERR(err, done)) return;
            done(null);
        });
    },
};

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function asyncQueryOneRow(sql, params) {
    return new Promise((resolve, reject) => {
        sqldb.queryOneRow(sql, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function safeAsync(func, callback) {
    new Promise(async () => {
        try {
            callback(await func());
        } catch (err) {
            callback(err);
        }
    });
};

module.exports = { 
    sync: function(courseInfo, questionDB, callback) {
        safeAsync(async () => {
            // Aggregate all tags into a form that we can pass in one go to our sproc
            // Since all this data will be sent over the wire, we'll send it in a
            // compact form of an array of arrays, where each array will correspond to
            // one tag: [tag_name, tag_color_description]. This saves bytes over JSON's
            // typical verbose objects.
            const tags = courseInfo.tags || [];
            const paramTags = tags.map(tag => ([
                tag.name,
                tag.color,
                tag.description,
            ]));

            const tagParams = {
                // node-postgres will try to convert to postgres arrays, so we
                // need to explicitly serialize ourselves: see
                // https://github.com/brianc/node-postgres/issues/442
                new_tags: JSON.stringify(paramTags),
                course_id: courseInfo.courseId,
            };
            const res = await asyncQueryOneRow(sql.update_tags, tagParams);

            // We'll get back a single row containing an array of IDs of the tags
            // in order.
            const tagIdsByName = res.rows[0].new_tag_ids.reduce((acc, id, index) => {
                acc[paramTags[index][0]] = id;
                return acc;
            }, {});

            // Ensure that all question tags are valid. As we go, build
            // up an array of all the information that we'll need at the DB.
            // As above, we'll use a compact representation to send this information
            // to the DB. We'll have an array of arrays, which each array
            // containing info for one question in the form
            // [question_id, [tag_1_id, tag_2_id, ...]].
            const paramQuestionTags = [];

            for (const qid in questionDB) {
                const question = questionDB[qid]
                const tags = question.tags || []
                const unknownTags = tags.filter(tag => !(tag in tagIdsByName));
                if (unknownTags.length > 0) {
                    throw new Error(`Question ${qid} has unknown tags: ${unknownTags.join(', ')}`);
                }
                paramQuestionTags.push([question.id, tags.map(tag => tagIdsByName[tag])]);
            }

            const questionTagParams = {
                new_question_tags: JSON.stringify(paramQuestionTags),
            }
            await asyncQueryOneRow(sql.update_question_tags, questionTagParams);
        }, callback);
    }
}

const sqldb = require('@prairielearn/prairielib/sql-db');

function safeAsync(func, callback) {
    new Promise(async () => {
        let error = null;
        let result;
        try {
            result = await func();
        } catch (err) {
            error = err;
        }
        callback(error, result);
    });
};

module.exports.sync = function(courseInfo, callback) {
    safeAsync(async () => {
        const topics = courseInfo.topics || [];
        const topicsParams = topics.map((topic, index) => ({
            name: topic.name,
            number: index + 1,
            color: topic.color,
            description: topic.description,
        }));

        const params = [
            JSON.stringify(topicsParams),
            courseInfo.courseId,
        ];
        await sqldb.callAsync('sync_topics', params);
    }, callback);
}

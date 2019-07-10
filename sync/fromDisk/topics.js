const sqldb = require('@prairielearn/prairielib/sql-db');
const { safeAsync } = require('../../lib/async');

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

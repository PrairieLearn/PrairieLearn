const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports.sync = function(courseInfo, questionDB, callback) {
    callbackify(async () => {
        const topics = courseInfo.topics || [];

        // We'll create placeholder topics for tags that aren't specified in
        // infoCourse.json.
        const knownTopicNames = new Set(topics.map(topic => topic.name));
        const missingTopicNames = new Set();
        Object.values(questionDB).forEach(q => {
            if (!knownTopicNames.has(q.topic)) {
                missingTopicNames.add(q.topic);
            }
        });
        topics.push(...[...missingTopicNames].map(name => ({
            name,
            color: 'gray1',
            description: 'Auto-generated from use in a question; add this topic to your courseInfo.json file to customize',
        })));

        const topicsParams = topics.map((topic, index) => ({
            name: topic.name,
            color: topic.color,
            description: topic.description,
        }));

        const params = [
            JSON.stringify(topicsParams),
            courseInfo.courseId,
        ];
        await sqldb.callAsync('sync_topics', params);
    })(callback);
}

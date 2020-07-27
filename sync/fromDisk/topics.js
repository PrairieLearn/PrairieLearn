const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

function getDuplicates(arr) {
    const seen = new Set();
    return arr.filter(v => {
        const present = seen.has(v);
        seen.add(v);
        return present;
    });
}

function getDuplicatesByKey(arr, key) {
    return getDuplicates(arr.map(v => v[key]));
}

module.exports.sync = function(courseInfo, questionDB, callback) {
    callbackify(async () => {
        const topics = courseInfo.topics || [];

        // First, do a sanity check for duplicate topic names. Because of how the
        // syncing sproc is structured, there's no meaningful error message if
        // duplicates are present.
        const duplicateNames = getDuplicatesByKey(topics, 'name');
        if (duplicateNames.length > 0) {
            const duplicateNamesJoined = duplicateNames.join(', ');
            throw new Error(`Duplicate topic names found: ${duplicateNamesJoined}. Topic names must be unique within the course.`);
        }

        // We'll create placeholder topics for topics that aren't specified in
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

        const topicsParams = topics.map((topic) => ({
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
};

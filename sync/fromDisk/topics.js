// @ts-check
const { callbackify, promisify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');

/**
 * @param {any} courseInfo
 * @param {any} questionDB
 * @param {(err: Error | null | undefined) => void} callback
 */
module.exports.sync = function(courseInfo, questionDB, callback) {
    callbackify(async () => {
        const topics = courseInfo.topics || [];

        // We'll create placeholder topics for tags that aren't specified in
        // infoCourse.json.
        const knownTopicNames = new Set(topics.map(topic => topic.name));
        const questionTopicNames = [];
        Object.values(questionDB).forEach(q => {
            questionTopicNames.push(q.topic);
            questionTopicNames.push(...(q.secondaryTopics || []));
        })
        const missingTopicNames = questionTopicNames.filter(name => !knownTopicNames.has(name));
        topics.push(...missingTopicNames.map(name => ({
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

/**
 * @param {import('../course-db').CourseData} courseData
 */
module.exports.syncNew = async function(courseId, courseData) {
    if (infofile.hasErrors(courseData.course)) {
        // Skip; no valid course from which to sync
        return;
    }

    const courseInfo = {
        courseId,
        topics: courseData.course.data.topics,
    };

    const oldQuestions = {};
    Object.entries(courseData.questions).forEach(([qid, question]) => {
        if (infofile.hasErrors(question)) {
            // Skip for now
            // TODO: make sure that we maintain tags that are currently used
            // by unsyncable questions
            return;
        }
        oldQuestions[qid] = question.data;
    });


    await promisify(module.exports.sync)(courseInfo, oldQuestions);
}

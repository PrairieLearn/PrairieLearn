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
    // We can only safely remove unused topics if both `infoCourse.json` and all
    // question `info.json` files are valid.
    const isInfoCourseValid = !infofile.hasErrors(courseData.course);
    const areAllInfoQuestionsValid = Object.values(courseData.questions).every(q => !infofile.hasErrors(q));
    const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

    /** @type {string[]} */
    let courseTopics = [];
    if (!infofile.hasErrors(courseData.course)) {
        courseTopics = courseData.course.data.topics.map(t => JSON.stringify([
            t.name,
            t.description,
            t.color,
        ]));
    }

    /** @type Set<string> */
    const knownQuestionTopicNames = new Set();
    Object.values(courseData.questions).forEach(q => {
        if (!infofile.hasErrors(q)) {
            knownQuestionTopicNames.add(q.data.topic);
        }
    });
    const questionTopicNames = [...knownQuestionTopicNames];

    const params = [
        !infofile.hasErrors(courseData.course),
        deleteUnused,
        courseTopics,
        questionTopicNames,
        courseId,
    ];

    const res = await sqldb.callOneRowAsync('sync_topics_new', params);
}

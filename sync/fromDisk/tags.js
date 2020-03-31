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
        const tags = courseInfo.tags || [];

        // First, do a sanity check for duplicate tag names. Because of how the
        // syncing sproc is structured, there's no meaningful error message if
        // duplicates are present.
        const duplicateNames = getDuplicatesByKey(tags, 'name');
        if (duplicateNames.length > 0) {
            const duplicateNamesJoined = duplicateNames.join(', ');
            throw new Error(`Duplicate tag names found: ${duplicateNamesJoined}. Tag names must be unique within the course.`);
        }

        // We'll create placeholder tags for tags that aren't specified in
        // infoCourse.json.
        const knownTagNames = new Set(tags.map(tag => tag.name));
        const missingTagNames = new Set();
        Object.values(questionDB).forEach(q => {
            (q.tags || []).forEach(tag => {
                if (!knownTagNames.has(tag)) {
                    missingTagNames.add(tag);
                }
            });
        });
        tags.push(...[...missingTagNames].map(name => ({
            name,
            color: 'gray1',
            description: 'Auto-generated from use in a question; add this tag to your courseInfo.json file to customize',
        })));

        // Aggregate all tags into a form that we can pass in one go to our sproc
        // Since all this data will be sent over the wire, we'll send it in a
        // compact form of an array of arrays, where each array will correspond to
        // one tag: [tag_name, tag_color_description]. This saves bytes over JSON's
        // typical verbose objects.
        const paramTags = tags.map(tag => ([
            tag.name,
            tag.color,
            tag.description,
        ]));

        const tagParams = [
            // node-postgres will try to convert to postgres arrays, so we
            // need to explicitly serialize ourselves: see
            // https://github.com/brianc/node-postgres/issues/442
            JSON.stringify(paramTags),
            courseInfo.courseId,
        ];
        const res = await sqldb.callAsync('sync_course_tags', tagParams);

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
            const question = questionDB[qid];
            const tags = question.tags || [];
            const unknownTags = tags.filter(tag => !(tag in tagIdsByName));
            if (unknownTags.length > 0) {
                throw new Error(`Question ${qid} has unknown tags: ${unknownTags.join(', ')}`);
            }
            const duplicateTags = getDuplicates(tags);
            if (duplicateTags.length > 0) {
                throw new Error(`Question ${qid} has duplicate tags: ${duplicateTags.join(', ')}`);
            }
            paramQuestionTags.push([question.id, tags.map(tag => tagIdsByName[tag])]);
        }

        await sqldb.callAsync('sync_question_tags', [JSON.stringify(paramQuestionTags)]);
    })(callback);
};

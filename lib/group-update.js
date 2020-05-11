const ERR = require('async-stacktrace');
const util = require('util');
const _ = require('lodash');
const path = require('path');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const serverJobs = require('./server-jobs');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {

    /**
     * Update question instance scores from a CSV file.
     *
     * @param {number} assessment_id - The assessment to update.
     * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
     * @param {number} user_id - The current user performing the update.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    uploadInstanceGroups(assessment_id, csvFile, user_id, authn_user_id, callback) {
        //debug('uploadInstanceQuestionScores()');
        if (csvFile == null) {
            return callback(new Error('No CSV file uploaded'));
        }
        const params = {assessment_id};
        sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_label = result.rows[0].assessment_label;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;
            
            const options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'upload_instance_groups',
                description: 'Upload group settings for ' + assessment_label,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                const jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'upload_instance_groups',
                    description: 'Upload group settings for ' + assessment_label,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    job.verbose('Uploading group settings for ' + assessment_label);

                    let output = null;
                    let outputCount = 0;
                    let outputThreshold = 100;
                    let grouptype = 1; //indicate this group is assigned_by_instructor
                    job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
                    job.verbose(`----------------------------------------`);
                    const csvStream = streamifier.createReadStream(csvFile.buffer, {encoding: 'utf8'});
                    const csvConverter = csvtojson({
                        colParser:{
                            groupname: 'string',
                            uid: 'string',
                        },
                        maxRowLength: 10000,
                    });
                    let successCount = 0, errorCount = 0;
                    csvConverter
                        .fromStream(csvStream)
                        .subscribe((json, number) => {
                            return new Promise((resolve, _reject) => {
                                const msg = `Processing CSV record ${number}: ${JSON.stringify(json)}`;
                                if (output == null) {
                                    output = msg;
                                } else {
                                    output += '\n' + msg;
                                }
                                module.exports._updateGroupsFromJson(json, assessment_id, authn_user_id, (err) => {
                                    if (err) {
                                        errorCount++;
                                        const msg = String(err);
                                        if (output == null) {
                                            output = msg;
                                        } else {
                                            output += '\n' + msg;
                                        }
                                    } else {
                                        successCount++;
                                    }
                                    outputCount++;
                                    if (outputCount >= outputThreshold) {
                                        job.verbose(output);
                                        output = null;
                                        outputCount = 0;
                                        outputThreshold *= 2; // exponential backoff
                                    }
                                    resolve();
                                });
                            });
                        })
                        .then(() => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.verbose(`----------------------------------------`);
                            if (errorCount == 0) {
                                job.verbose(`Successfully updated groups for ${successCount} students, with no errors`);
                                job.succeed();
                            } else {
                                job.verbose(`Successfully updated groups for ${successCount} students`);
                                job.fail(`Error updating ${errorCount} students`);
                            }
                        })
                        .catch((err) => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.fail('Error processing CSV', err);
                        });
                });
            });
        });
    },

    // missing values and empty strings get mapped to null
    _getJsonPropertyOrNull(json, key) {
        const value = _.get(json, key, null);
        if (value == '') {
            return null;
        }
        return value;
    },

    // "feedback" gets mapped to {manual: "XXX"} and overrides the contents of "feedback_json"
    _getFeedbackOrNull(json) {
        const feedback_string = module.exports._getJsonPropertyOrNull(json, 'feedback');
        const feedback_json = module.exports._getJsonPropertyOrNull(json, 'feedback_json');
        let feedback = null;
        if (feedback_string != null) {
            feedback = {manual: feedback_string};
        }
        if (feedback_json != null) {
            let feedback_obj = null;
            try {
                feedback_obj = JSON.parse(feedback_json);
            } catch (e) {
                throw new Error(`Unable to parse "feedback_json" field as JSON: ${e}`);
            }
            if (!_.isPlainObject(feedback_obj)) {
                throw new Error(`Parsed "feedback_json" is not a JSON object: ${feedback_obj}`);
            }
            feedback = feedback_obj;
            if (feedback_string != null) {
                feedback.manual = feedback_string;
            }
        }
        return feedback;
    },

    _updateGroupsFromJson(json, assessment_id, authn_user_id, callback) {
        util.callbackify(async () => {
            const params = [
                assessment_id,
                module.exports._getJsonPropertyOrNull(json, 'groupname'),
                module.exports._getJsonPropertyOrNull(json, 'uid'),
            ];
            await sqldb.callAsync('assessment_groups_update', params);
        })(callback);
    },

    /**
     * Auto generate group settings from input
     *
     * @param {number} assessment_id - The assessment to update.
     * @param {number} user_id - The current user performing the update.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    autoGroups(assessment_id, user_id, authn_user_id, maxnum, minnum, option, callback) {
        //debug('uploadInstanceQuestionScores()');
        if(maxnum < 2 || minnum < 1 || maxnum < minnum){
            return callback(new Error('Group Setting Requirements: max > 1; min > 0; max > min'));
        }
        const params = {assessment_id};
        sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_label = result.rows[0].assessment_label;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;
            
            const options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'auto_generate_groups',
                description: 'Auto generate group settings for ' + assessment_label,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                const jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'auto_generate_groups',
                    description: 'Auto generate group settings for ' + assessment_label,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    (async () => {
                        try{
                            job.verbose('Auto generate group settings for ' + assessment_label);
                            job.verbose(`----------------------------------------`);
                            job.verbose(`Fetching the enrollment lists...`);
                            const aid = {assessment_id};
                            var students = [];
                            const resultlist = await sqldb.queryAsync(sql.select_enrollments, aid);
                            resultlist.rows.forEach(element => {
                                students.push(element.user_list);
                            });
                            module.exports._shuffle(students)
                            var num_students = resultlist.rowCount;
                            var not_assigned = [];
                            const resultlist2 = await sqldb.queryAsync(sql.select_not_assigned, aid);
                            resultlist2.rows.forEach(element => {
                                not_assigned.push(element.user_list);
                            });
                            module.exports._shuffle(not_assigned)
                            var num_not_assigned = resultlist2.rowCount;
                            job.verbose(`There are ` + num_students + ' students enrolled in ' + assessment_label)
                            job.verbose(num_not_assigned + ' of them have not been in a group');
                            job.verbose(`----------------------------------------`);
                            job.verbose(`Processing creating groups - max of ` + maxnum + ' and min of ' + minnum);
                            num_group = Math.ceil(num_students / maxnum);
                            let successCount = 0;
                            let errorCount = 0;
                            let output = null;
                            let outputCount = 0;
                            let outputThreshold = 100;
                            for(let i = 0; i < num_group; i++){
                                //fill in the group
                                let teamname = 'team' + i;
                                let members = [];
                                for(let j = 0; j < maxnum; j++){
                                    if(students.length > 0){
                                        let uid = students.pop();
                                        members.push(uid);
                                        job.verbose(uid);                                        
                                    }
                                }
                                for(const member of members){
                                    const msg = 'Processing record ' + member;
                                    if (output == null) {
                                        output = msg;
                                    } else {
                                        output += '\n' + msg;
                                    }
                                    try{
                                        const params = [
                                            assessment_id,
                                            teamname,
                                            member
                                        ];
                                        await sqldb.callAsync('assessment_groups_update', params);
                                        successCount++;
                                    } catch (err){
                                        errorCount++;
                                        const msg = String(err);
                                        if (output == null) {
                                            output = msg;
                                        } else {
                                            output += '\n' + msg;
                                        }
                                    }
                                    outputCount++;
                                    if (outputCount >= outputThreshold) {
                                        job.verbose(output);
                                        output = null;
                                        outputCount = 0;
                                        outputThreshold *= 2; // exponential backoff
                                    }
                                }
                            }
                            job.verbose(`----------------------------------------`);
                            if (errorCount == 0) {
                                job.verbose(`Successfully updated groups for ${successCount} students, with no errors`);
                                job.succeed();
                            } else {
                                job.verbose(`Successfully updated groups for ${successCount} students`);
                                job.fail(`Error updating ${errorCount} students`);
                            }
                        } catch (err){
                            logger.error('Error while creating groups', err);
                            serverJobs.failJobSequence(job_sequence_id);
                        } 
                    })();
                });
            });
        });
    },
    _shuffle(array) {
        var currentIndex = array.length, temporaryValue, randomIndex;
        // While there remain elements to shuffle...
        while (0 !== currentIndex) {
          // Pick a remaining element...
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex -= 1;
      
          // And swap it with the current element.
          temporaryValue = array[currentIndex];
          array[currentIndex] = array[randomIndex];
          array[randomIndex] = temporaryValue;
        }
        return array;
    },
    async _updateGroups(assessment_id, group_name, uid) {
        const params = [
            assessment_id,
            group_name,
            uid
        ];
        await sqldb.callAsync('assessment_groups_update', params);
    },
};

var syncAssessmentsMongo = require('./fromMongo/assessments');
var syncUsers = require('./fromMongo/users');
var syncAssessmentInstances = require('./fromMongo/assessmentInstances');
var syncQuestionInstances = require('./fromMongo/questionInstances');
var syncSubmissions = require('./fromMongo/submissions');
var syncAccesses = require('./fromMongo/accesses');
var syncQuestionViews = require('./fromMongo/questionViews');

var syncMongoToSQL = function(callback) {
    logger.info("Starting sync of Mongo to SQL");
    async.series([
        function(callback) {logger.info("Syncing assessments from Mongo to SQL DB"); callback(null);},
        syncAssessmentsMongo.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing users from Mongo to SQL DB"); callback(null);},
        syncUsers.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing assessment instances from Mongo to SQL DB"); callback(null);},
        syncAssessmentInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing question instances from Mongo to SQL DB"); callback(null);},
        syncQuestionInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing submissions from Mongo to SQL DB"); callback(null);},
        syncSubmissions.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing accesses from Mongo to SQL DB"); callback(null);},
        syncAccesses.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.info("Syncing questionViews from Mongo to SQL DB"); callback(null);},
        syncQuestionViews.sync.bind(null, courseDB.courseInfo),
    ], function(err) {
        if (err) return callback(err);
        logger.info("Completed sync of Mongo to SQL");
        callback(null);
    });
};


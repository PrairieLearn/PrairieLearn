var syncAssessmentsMongo = require('./fromMongo/assessments');
var syncUsers = require('./fromMongo/users');
var syncAssessmentInstances = require('./fromMongo/assessmentInstances');
var syncQuestionInstances = require('./fromMongo/questionInstances');
var syncSubmissions = require('./fromMongo/submissions');
var syncAccesses = require('./fromMongo/accesses');
var syncQuestionViews = require('./fromMongo/questionViews');

var syncMongoToSQL = function(callback) {
    logger.infoOverride("Starting sync of Mongo to SQL");
    async.series([
        function(callback) {logger.infoOverride("Syncing assessments from Mongo to SQL DB"); callback(null);},
        syncAssessmentsMongo.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing users from Mongo to SQL DB"); callback(null);},
        syncUsers.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing assessment instances from Mongo to SQL DB"); callback(null);},
        syncAssessmentInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing question instances from Mongo to SQL DB"); callback(null);},
        syncQuestionInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing submissions from Mongo to SQL DB"); callback(null);},
        syncSubmissions.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing accesses from Mongo to SQL DB"); callback(null);},
        syncAccesses.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing questionViews from Mongo to SQL DB"); callback(null);},
        syncQuestionViews.sync.bind(null, courseDB.courseInfo),
    ], function(err) {
        if (err) return callback(err);
        logger.infoOverride("Completed sync of Mongo to SQL");
        callback(null);
    });
};


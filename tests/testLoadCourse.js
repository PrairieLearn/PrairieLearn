var ERR = require('async-stacktrace');
var assert = require('assert');
var fs = require('fs');

var courseDB = require('../lib/course-db');
var logger = require('./dummyLogger');

describe('courseDB.loadFullCourse() on exampleCourse', function() {
    this.timeout(20000);

    var courseDir = 'exampleCourse';
    var course;
    before('load course from disk', function(callback) {
        courseDB.loadFullCourse(courseDir, logger, function(err, c) {
            if (ERR(err, callback)) return;
            course = c;
            callback(null);
        });
    });

    describe('the in-memory "course" object', function() {
        it('should contain "courseInfo"', function() {
            assert.ok(course.courseInfo);
        });
        it('should contain "questionDB"', function() {
            assert.ok(course.questionDB);
        });
        it('should contain "courseInstanceDB"', function() {
            assert.ok(course.courseInstanceDB);
        });
    });
});

describe('courseDB.loadFullCourse() on brokenCourse', function() {

    var courseDir = 'tests/testLoadCourse/brokenCourse';
    var assessmentFilename = `${courseDir}/courseInstances/Fa18/assessments/quiz1/infoAssessment.json`;
    var questionFilename = `${courseDir}/questions/basicV3/info.json`;

    beforeEach('write correct infoAssessment and question', function(callback) {
        var assessmentJson = {
            'uuid': 'bee70f4d-4220-47f1-b4ed-59c88ce08657',
            'type': 'Exam',
            'number': '1',
            'title': 'Test quiz 1',
            'set': 'Quiz',
            'allowAccess': [
                { 'startDate': '2018-01-01T00:00:00',
                  'endDate': '2019-01-01T00:00:00'},
            ],
        };

        var questionJson = {
            'uuid': 'ba0b8e5b-6348-43f8-b483-083e0bea6332',
            'title': 'Basic V3 question',
            'topic': 'basic',
            'type': 'v3',
        };
        fs.writeFile(assessmentFilename, JSON.stringify(assessmentJson), function(err) {
            if (ERR(err, callback)) return;

            fs.writeFile(questionFilename, JSON.stringify(questionJson), function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    after('removing test files', function(callback) {
        fs.unlink(assessmentFilename, function(err) {
            if (ERR(err, callback)) return;

            fs.unlink(questionFilename, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('trying to load broken course pieces', function() {
        it('assessment: invalid set should fail', function(callback) {

            var assessmentJson = {
                'uuid': 'bee70f4d-4220-47f1-b4ed-59c88ce08657',
                'type': 'Exam',
                'number': '1',
                'title': 'Test quiz 1',
                'set': 'NotARealSet',
                'allowAccess': [
                    { 'startDate': '2018-01-01T00:00:00',
                      'endDate': '2019-01-01T00:00:00'},
                ],
            };
            var filename = 'courseInstances/Fa18/assessments/quiz1/infoAssessment.json';

            loadHelper(courseDir, filename, assessmentJson, /invalid "set":/, callback);
         });

         it('assessment: access rule: invalid startDate should fail', function(callback) {

             var assessmentJson = {
                 'uuid': 'bee70f4d-4220-47f1-b4ed-59c88ce08657',
                 'type': 'Exam',
                 'number': '1',
                 'title': 'Test quiz 1',
                 'set': 'Quiz',
                 'allowAccess': [
                     { 'startDate': 'NotADate',
                       'endDate': '2019-01-01T00:00:00'},
                 ],
             };
             var filename = 'courseInstances/Fa18/assessments/quiz1/infoAssessment.json';

             loadHelper(courseDir, filename, assessmentJson, /invalid allowAccess startDate/, callback);
          });

          it('assessment: access rule: invalid endDate should fail', function(callback) {

              var assessmentJson = {
                  'uuid': 'bee70f4d-4220-47f1-b4ed-59c88ce08657',
                  'type': 'Exam',
                  'number': '1',
                  'title': 'Test quiz 1',
                  'set': 'Quiz',
                  'allowAccess': [
                      { 'startDate': '2019-01-01T22:22:22',
                        'endDate': 'AlsoReallyNotADate'},
                  ],
              };
              var filename = 'courseInstances/Fa18/assessments/quiz1/infoAssessment.json';

              loadHelper(courseDir, filename, assessmentJson, /invalid allowAccess endDate/, callback);
           });

          it('assessment: access rule: startDate after endDate should fail', function(callback) {

              var assessmentJson = {
                  'uuid': 'bee70f4d-4220-47f1-b4ed-59c88ce08657',
                  'type': 'Exam',
                  'number': '1',
                  'title': 'Test quiz 1',
                  'set': 'Quiz',
                  'allowAccess': [
                      { 'startDate': '2020-01-01T11:11:11',
                        'endDate': '2019-01-01T00:00:00'},
                  ],
              };
              var filename = 'courseInstances/Fa18/assessments/quiz1/infoAssessment.json';

              loadHelper(courseDir, filename, assessmentJson, /must not be after/, callback);
           });

           it('question: topic not in courseInfo should fail', function(callback) {

               var questionJson = {
                   'uuid': 'ba0b8e5b-6348-43f8-b483-083e0bea6332',
                   'title': 'Basic V3 question',
                   'topic': 'notARealTopic',
                   'type': 'v3',
               };
               var filename = 'questions/basicV3/info.json';

               loadHelper(courseDir, filename, questionJson, /invalid "topic"/, callback);
           });

           it('question: secondaryTopics not in courseInfo should fail', function(callback) {

               var questionJson = {
                   'uuid': 'ba0b8e5b-6348-43f8-b483-083e0bea6332',
                   'title': 'Basic V3 question',
                   'topic': 'basic',
                   'secondaryTopics': ['basic', 'notARealTopic'],
                   'type': 'v3',
               };
               var filename = 'questions/basicV3/info.json';

               loadHelper(courseDir, filename, questionJson, /invalid "secondaryTopics"/, callback);
           });

           it('question: tag not in courseInfo should fail', function(callback) {

               var questionJson = {
                   'uuid': 'ba0b8e5b-6348-43f8-b483-083e0bea6332',
                   'title': 'Basic V3 question',
                   'topic': 'basic',
                   'type': 'v3',
                   'tags': ['NotARealTag'],
               };
               var filename = 'questions/basicV3/info.json';

               loadHelper(courseDir, filename, questionJson, /invalid "tags"/, callback);
           });
    });
});

var loadHelper = function(courseDir, filename, contents, expectedErrorRE, callback) {

    fs.writeFile(courseDir + '/' + filename, JSON.stringify(contents), function(err) {
             if (err) { return callback(err); }

             courseDB.loadFullCourse(courseDir, logger, function(err, _c) {
                 if (err) {
                     if (expectedErrorRE.test(err)) {
                         callback(null);
                     } else {
                         callback(new Error('unexpected error ' + err));
                     }
                 } else {
                     callback(new Error('returned successfully, which should not happen'));
                 }
             });
     });

};

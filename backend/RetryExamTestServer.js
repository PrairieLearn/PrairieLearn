
define(["underscore", "moment-timezone", "PrairieRandom"], function(_, moment, PrairieRandom) {

    var RetryExamTestServer = {};

    RetryExamTestServer.getDefaultOptions = function() {
        return {
            questions: [],
            nQuestions: 20,
            autoCreate: true,
            autoCreateQuestions: true,
            allowQuestionSubmit: false,
            allowQuestionSave: true,
            allowQuestionRetry: true,
            showQuestionTitle: false,
            allowFinish: true,
        };
    };

    RetryExamTestServer.updateTest = function(test, options) {
        _.defaults(test, {
            scoresByUID: {},
            highScoresByUID: {},
            completeHighScoresByUID: {},
            scores: {},
            highScores: {},
            completeHighScores: {},
            questionInfo: {},
        });
        test.nQuestions = options.nQuestions;
        test.text = options.text;
        test._private = ["scoresByUID", "highScoresByUID", "completeHighScoresByUID"];
        if (options.availDate)
            test.availDate = moment.tz(options.availDate, options.timezone).format();
    };

    RetryExamTestServer.updateTInstance = function(tInstance, test, options) {
        if (tInstance.qids === undefined) {
            var questions = [];
            var rand = new PrairieRandom.RandomGenerator();
            var levelChoices = rand.randCategoryChoices(options.nQuestions, options.questionGroups.length);
            var iLevel, iType, typeChoices;
            for (iLevel = 0; iLevel < options.questionGroups.length; iLevel++) {
                typeChoices = rand.randCategoryChoices(levelChoices[iLevel], options.questionGroups[iLevel].length);
                for (iType = 0; iType < options.questionGroups[iLevel].length; iType++) {
                    questions = questions.concat(rand.randNElem(typeChoices[iType], options.questionGroups[iLevel][iType]));
                }
            }
            var now = Date.now();
            tInstance.qids = _(questions).pluck('qid');
            tInstance.maxScore = 0;
            tInstance.questionsByQID = _(questions).indexBy('qid');
            _(tInstance.questionsByQID).each(function(question, qid) {
                question.nGradedAttempts = 0;
                question.awardedPoints = 0;
                question.correct = false;
                tInstance.maxScore += Math.max.apply(null, question.points);
            });
            tInstance.createDate = new Date(now).toJSON();
            tInstance.open = true;
            tInstance.submissionsByQid = {};
            tInstance.score = 0;
            tInstance.gradingDates = [];
        }
        return tInstance;
    };

    RetryExamTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (!tInstance.open)
            throw Error("Test is not open");
        if (!_(tInstance.qids).contains(submission.qid))
            throw Error("QID is not in tInstance");
        var question = tInstance.questionsByQID[submission.qid];
        if (question.nGradedAttempts >= question.points.length)
            throw Error("Too many attempts at question");
        if (question.correct)
            throw Error("question is already correct");

        tInstance.submissionsByQid[submission.qid] = submission;
        submission.graded = false;
        submission._private = ["score", "feedback", "trueAnswer", "oldTInstance", "oldTest", "newTInstance", "newTest"];
    };

    RetryExamTestServer.grade = function(tInstance, test) {
        if (!tInstance.open)
            throw Error("Test is not open");

        var score = 0;
        var i, qid, submission, nAnswers = 0;
        for (i = 0; i < tInstance.qids.length; i++) {
            qid = tInstance.qids[i];
            submission = tInstance.submissionsByQid[qid];
            if (submission === undefined)
                continue;
            question = tInstance.questionsByQID[qid];
            if (!submission.graded) {
                if (submission.score >= 0.5) {
                    question.correct = true;
                    submission.correct = true;
                    question.awardedPoints = question.points[question.nGradedAttempts];
                } else {
                    submission.correct = false;
                }
                question.nGradedAttempts++;
                submission.graded = true;
            }
        }
        tInstance.score = 0;
        _(tInstance.questionsByQID).forEach(function(question) {
            tInstance.score += question.awardedPoints;
        });
        tInstance.gradingDates.push(new Date().toJSON());
    };

    RetryExamTestServer.finish = function(tInstance, test) {
        if (!tInstance.open)
            throw Error("Test is already finished");

        this.grade(tInstance, test);
        
        var i, qid, submission, question, nAnswers = 0;
        for (i = 0; i < tInstance.qids.length; i++) {
            qid = tInstance.qids[i];
            question = tInstance.questionsByQID[qid];
            if (test.questionInfo[qid] === undefined)
                test.questionInfo[qid] = {
                    nAttempts: 0,
                    nCorrect: 0,
                };
            if (question.correct) {
                test.questionInfo[qid].nCorrect++;
            }
            submission = tInstance.submissionsByQid[qid];
            if (submission !== undefined) {
                test.questionInfo[qid].nAttempts++;
                nAnswers++;
                delete submission._private;
            }
        }
        var complete = (nAnswers === tInstance.qids.length);
        tInstance.finishDate = new Date().toJSON();

        tInstance.open = false;
    };

    return RetryExamTestServer;
});

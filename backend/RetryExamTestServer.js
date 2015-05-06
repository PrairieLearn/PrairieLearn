
define(["underscore", "moment-timezone", "PrairieRandom"], function(_, moment, PrairieRandom) {

    var PracExamTestServer = {};

    PracExamTestServer.getDefaultOptions = function() {
        return {
            questions: [],
            nQuestions: 20,
            autoCreate: true,
            autoCreateQuestions: true,
            allowQuestionSubmit: false,
            allowQuestionSave: true,
            allowQuestionRetry: true,
        };
    };

    PracExamTestServer.updateTest = function(test, options) {
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
        test._private = ["scoresByUID", "highScoresByUID", "completeHighScoresByUID"];
    };

    PracExamTestServer.updateTInstance = function(tInstance, test, options) {
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
            _(tInstance.questionsByQID).forEach(function(qid, question) {
                question.nGradedAttempts = 0;
                question.graded = true;
                question.awardedPoints = 0;
                question.correct = false;
                tInstance.maxScore += Math.max.apply(null, question.points);
            });
            tInstance.createDate = new Date(now).toJSON(),
            tInstance.open = true,
            tInstance.submissionsByQid = {},
            tInstance.score = 0;
            tInstance.gradingDates = [];
        }
        return tInstance;
    };

    PracExamTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (!tInstance.open)
            throw Error("Test is not open");
        if (!_(tInstance.qids).contains(submission.qid))
            throw Error("QID is not in tInstance")
        var question = tInstance.questionsByQID[submission.qid];
        if (question.nGradedAttempts >= question.points.length)
            throw Error("Too many attempts at question");
        if (question.correct)
            throw Error("question is already correct");

        tInstance.submissionsByQid[submission.qid] = submission;
        submission._private = ["score", "trueAnswer", "oldTInstance", "oldTest", "newTInstance", "newTest"];
        tInstance.questionsByQID[submission.qid].graded = false;
    };

    PracExamTestServer.grade = function(tInstance, test) {
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
            if (!question.graded) {
                if (submission.score >= 0.5) {
                    question.correct = true;
                    question.awardedPoints = question.points[question.nGradedAttempts];
                }
                question.nGradedAttempts++;
                question.graded = true;
            }
        }
        tInstance.score = 0;
        _(tInstance.questionsByQID).forEach(function(question) {
            tInstance.score += question.awardedPoints;
        }).;
        tInstance.gradingDates.push(new Date().toJSON());
    };

    PracExamTestServer.finish = function(tInstance, test) {
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

        var uid = tInstance.uid;
        var sanitizedUID = uid.replace(/\./g, "_");
        if (test.scoresByUID[sanitizedUID] === undefined)
            test.scoresByUID[sanitizedUID] = [];
        test.scoresByUID[sanitizedUID].push(tInstance.score);
        if (test.highScoresByUID[sanitizedUID] === undefined)
            test.highScoresByUID[sanitizedUID] = 0;
        test.highScoresByUID[sanitizedUID] = Math.max(tInstance.score, test.highScoresByUID[sanitizedUID]);
        if (complete) {
            if (test.completeHighScoresByUID[sanitizedUID] === undefined)
                test.completeHighScoresByUID[sanitizedUID] = 0;
            test.completeHighScoresByUID[sanitizedUID] = Math.max(tInstance.score, test.completeHighScoresByUID[sanitizedUID]);
        }

        test.scores = _.chain(test.scoresByUID).values().flatten().countBy().value();
        test.highScores = _.chain(test.highScoresByUID).values().countBy().value();
        test.completeHighScores = _.chain(test.completeHighScoresByUID).values().countBy().value();

        tInstance.open = false;
    };

    return PracExamTestServer;
});

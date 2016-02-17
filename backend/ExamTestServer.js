
define(["underscore", "moment-timezone", "PrairieRandom"], function(_, moment, PrairieRandom) {

    var ExamTestServer = {};

    ExamTestServer.getDefaultOptions = function() {
        return {
            questions: [],
            nQuestions: 20,
            autoCreateQuestions: true,
            allowQuestionSubmit: false,
            allowQuestionSave: true,
            allowFinish: true,
        };
    };

    ExamTestServer.updateTest = function(test, options) {
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
        test.maxScore = options.nQuestions;
        test.maxQScoresByQID = _.chain(options.qidGroups)
            .flatten()
            .map(function(qid) {return [qid, 1];})
            .object()
            .value();
        test.qids = _(options.qidGroups).flatten();
        test.text = options.text;
        test._private = ["scoresByUID", "highScoresByUID", "completeHighScoresByUID"];
    };

    ExamTestServer.updateTInstance = function(tInstance, test, options) {
        if (tInstance.qids === undefined) {
            var qids = [];
            var rand = new PrairieRandom.RandomGenerator();
            var levelChoices = rand.randCategoryChoices(options.nQuestions, options.qidGroups.length);
            var iLevel, iType, typeChoices;
            for (iLevel = 0; iLevel < options.qidGroups.length; iLevel++) {
                typeChoices = rand.randCategoryChoices(levelChoices[iLevel], options.qidGroups[iLevel].length);
                for (iType = 0; iType < options.qidGroups[iLevel].length; iType++) {
                    qids = qids.concat(rand.randNElem(typeChoices[iType], options.qidGroups[iLevel][iType]));
                }
            }
            var now = Date.now();
            tInstance.qids = qids;
            tInstance.createDate = new Date(now).toJSON(),
            tInstance.open = true,
            tInstance.submissionsByQid = {},
            tInstance.score = 0;
        }
        return tInstance;
    };

    ExamTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (!tInstance.open)
            throw Error("Test is not open");

        tInstance.submissionsByQid[submission.qid] = submission;
        submission._private = ["score", "trueAnswer", "oldTInstance", "oldTest", "newTInstance", "newTest"];
    };

    ExamTestServer.finish = function(tInstance, test) {
        if (!tInstance.open)
            throw Error("Test is already finished");

        var score = 0;
        var i, qid, submission, nAnswers = 0;
        for (i = 0; i < tInstance.qids.length; i++) {
            qid = tInstance.qids[i];
            submission = tInstance.submissionsByQid[qid];
            if (submission === undefined)
                continue;
            nAnswers++;
            if (test.questionInfo[qid] === undefined)
                test.questionInfo[qid] = {
                    nAttempts: 0,
                    nCorrect: 0,
                };
            test.questionInfo[qid].nAttempts++;
            if (submission.score >= 0.5) {
                score++;
                test.questionInfo[qid].nCorrect++;
            }
            delete submission._private;
        }
        var complete = (nAnswers === tInstance.qids.length);
        tInstance.score = score;
        tInstance.finishDate = new Date().toJSON();

        var uid = tInstance.uid;
        var sanitizedUID = uid.replace(/\./g, "_");
        if (test.scoresByUID[sanitizedUID] === undefined)
            test.scoresByUID[sanitizedUID] = [];
        test.scoresByUID[sanitizedUID].push(score);
        if (test.highScoresByUID[sanitizedUID] === undefined)
            test.highScoresByUID[sanitizedUID] = 0;
        test.highScoresByUID[sanitizedUID] = Math.max(score, test.highScoresByUID[sanitizedUID]);
        if (complete) {
            if (test.completeHighScoresByUID[sanitizedUID] === undefined)
                test.completeHighScoresByUID[sanitizedUID] = 0;
            test.completeHighScoresByUID[sanitizedUID] = Math.max(score, test.completeHighScoresByUID[sanitizedUID]);
        }

        test.scores = _.chain(test.scoresByUID).values().flatten().countBy().value();
        test.highScores = _.chain(test.highScoresByUID).values().countBy().value();
        test.completeHighScores = _.chain(test.completeHighScoresByUID).values().countBy().value();

        tInstance.open = false;
    };

    return ExamTestServer;
});

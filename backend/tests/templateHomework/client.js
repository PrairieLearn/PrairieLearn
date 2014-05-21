
define(["jquery", "underscore", "backbone", "Mustache", "rivets", "PrairieTemplate", "PrairieQueue", "PrairieRandom", "PrairieModel", "renderer", "./common.js"], function($, _, Backbone, Mustache, rivets, PrairieTemplate, PrairieQueue, PrairieRandom, PrairieModel, renderer, common) {

    var renderMasteryBar = function(modelData) {
        var masteryBar;
        if (modelData) {
            var mastery = Math.round(modelData.mastery * 100);
            var tooltip = "You currently have " + mastery.toFixed(0) + "% mastery for this homework (maximum 100%).";
            masteryBar = '<div class="progress"'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            masteryBar += '<div class="progress-bar progress-bar-success" style="width: ' + mastery.toFixed(0) + '%">' + mastery + '%</div>';
            masteryBar += '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - mastery).toFixed(0) + '%"></div>';
            masteryBar += '</div>';
        } else {
            masteryBar = '<div class="progress"></div>'
        }
        return masteryBar;
    };

    var renderRecommendBar = function(modelData, qid) {
        var recommendBar;
        if (modelData) {
            var recommend = modelData.qData[qid].recommend;
            var recommendDisplay = Math.round(recommend * 100);
            var tooltip;
            if (recommendDisplay < 25)
                tooltip = "Not recommended";
            else if (recommendDisplay < 50)
                tooltip = "Slighly recommended";
            else if (recommendDisplay < 75)
                tooltip = "Recommended";
            else
                tooltip = "Highly recommended";

            recommendBar = '<div class="progress"'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            recommendBar += '<div class="progress-bar progress-bar-info" style="width: ' + recommendDisplay.toFixed(0) + '%"></div>'
            recommendBar += '</div>';
        } else {
            recommendBar = '<div class="progress"></div>';
        }
        return recommendBar;
    };

    var renderDifficultyBar = function(modelData, qid) {
        var difficultyBar;
        if (modelData) {
            var qProb = modelData.qData[qid].qProb;
            var qProbDisplay = Math.round(qProb * 100);
            var tooltip = "You have a predicted " + qProbDisplay.toFixed(0) + "% chance of correctly answering this question."
            difficultyBar = '<div class="progress"'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            difficultyBar += '<div class="progress-bar progress-bar-danger" style="width: '
                + (100 - qProbDisplay).toFixed(0) + '%"></div>';
            difficultyBar += '<div class="progress-bar progress-bar-success" style="width: '
                + qProbDisplay.toFixed(0) + '%"></div>';
            difficultyBar += '</div>';
        } else {
            difficultyBar = '<div class="progress"></div>'
        }
        return difficultyBar;
    };

    var renderCorrectPoints = function(modelData, qid) {
        var correctPoints;
        if (modelData) {
            var correctBenefit = modelData.qData[qid].correctBenefit;
            var tooltip = "Number of mastery points for correctly answering this question.";

            correctPoints = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            correctPoints += (correctBenefit * 100).toFixed(2) + "%";
            correctPoints += '</span>';
        } else {
            correctPoints = '';
        }
        return correctPoints;
    };

    var renderIncorrectPoints = function(modelData, qid) {
        var incorrectPoints;
        if (modelData) {
            var incorrectPenalty = modelData.qData[qid].incorrectPenalty;
            var tooltip = "Number of mastery points for incorrectly answering this question.";

            incorrectPoints = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            incorrectPoints += (-incorrectPenalty * 100).toFixed(2) + "%";
            incorrectPoints += '</span>';
        } else {
            incorrectPoints = '';
        }
        return incorrectPoints;
    };

    var renderAttempts = function(modelData, qid) {
        var attempts;
        if (modelData) {
            var n = modelData.qData[qid].attempts;
            var tooltip = "You have attempted this question " + n + " " + ((n === 1) ? "time" : "times") + " in this homework.";
            var extraAtts = 'data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"';
            attempts = renderer.attemptsLabel(n, undefined, undefined, extraAtts);
        } else {
            attempts = '';
        }
        return attempts;
    };

    var renderMasteryScore = function(modelData) {
        var masteryScore;
        if (modelData) {
            var mastery = Math.round(modelData.mastery * 100);
            var tooltip = "You currently have " + mastery.toFixed(0) + "% mastery for this homework (maximum 100%).";
            masteryScore = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            masteryScore += 'Mastery: '
            masteryScore += '<strong>'
            masteryScore += mastery.toFixed(0) + '%';
            masteryScore += '</strong>'
            masteryScore += '</span>';
        } else {
            masteryScore = '<span></span>'
        }
        return masteryScore;
    };

    var renderHWScore = function(tInstance) {
        var score = tInstance.get("score");
        var tooltip = "The homework score is " + common.scoreFactor.toFixed(1) + " times the highest mastery achieved before the due date (up to 100%).";
        var extraAtts = 'data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"';
        var hwScore = '<span ' + extraAtts + '>';
        hwScore += 'HW Score: ';
        hwScore += '<strong>' + (score * 100).toFixed(0) + '%</strong>';
        hwScore += '</span>';
        return hwScore;
    };

    /** Determine the expected benefit in average probability for attempting a given question.

        @param {String} qid The question ID.
        @param {Object} userDist The state distribution object for the user.
        @param {Object} qDists A set of questionDists.
        @param {Array} qids The list of qids to average over.
        @return {Object} Information about the results.
    */
    var expectedBenefitAvgProbs = function(qid, userDist, qDists, qids, initAvgProb) {
        var expectedInfo = {};
        var obs = PrairieModel.userQuestionProb(userDist, qDists[qid]);
        expectedInfo.qProb = obs.p;

        var correctUserDist = JSON.parse(JSON.stringify(userDist));
        var correctQuestionDists = JSON.parse(JSON.stringify(qDists));
        common.updateDists(true, correctUserDist, correctQuestionDists[qid]);

        var incorrectUserDist = JSON.parse(JSON.stringify(userDist));
        var incorrectQuestionDists = JSON.parse(JSON.stringify(qDists));
        common.updateDists(false, incorrectUserDist, incorrectQuestionDists[qid]);

        var mastery = common.computeMastery(qids, qDists, userDist, initAvgProb);
        expectedInfo.correctBenefit = common.computeMastery(qids, correctQuestionDists, correctUserDist, initAvgProb) - mastery;
        expectedInfo.incorrectPenalty = -(common.computeMastery(qids, incorrectQuestionDists, incorrectUserDist, initAvgProb) - mastery);
        expectedInfo.expectedBenefit = expectedInfo.qProb * expectedInfo.correctBenefit
            - (1 - expectedInfo.qProb) * expectedInfo.incorrectPenalty;

        expectedInfo.expectedBenefit = obs.dPDSigma;

        return expectedInfo;
    };

    var computeModelData = function(qids, qDists, userDist, initAvgProb) {
        var modelData = {};
        modelData.qData = {};
        modelData.mastery = common.computeMastery(qids, qDists, userDist, initAvgProb);
        _(qids).each(function(qid) {
            var qData = expectedBenefitAvgProbs(qid, userDist, qDists, qids, initAvgProb);
            qData.attempts = PrairieModel.userQuestionAttempts(userDist, qid);
            modelData.qData[qid] = qData;
        });
        var expectedBenefits = _(modelData.qData).pluck("expectedBenefit");
        var maxBenefit = _(expectedBenefits).max();
        var minBenefit = _(expectedBenefits).min();
        var deltaBenefit = Math.max(1e-10, maxBenefit - minBenefit);
        _(qids).each(function(qid) {
            modelData.qData[qid].recommend = (modelData.qData[qid].expectedBenefit - minBenefit + 0.1 * deltaBenefit) / (1.1 * deltaBenefit);
        });
        return modelData;
    };

    var TestInstanceView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var template = this.test.get("template");
            if (template === undefined)
                return;
            var data = {};
            data.title = this.test.get("title");
            var hwNumber = this.test.get("number");
            data.number = hwNumber;
            data.tiid = this.model.get("tiid");

            var modelData = this.model.get("modelData");
            data.masteryScore = renderMasteryScore(modelData);
            data.masteryBar = renderMasteryBar(modelData);
            data.hwScore = renderHWScore(this.model);

            var dueDate = new Date(this.test.get("dueDate"));
            var options = {hour: "numeric", minute: "numeric"};
            var dateString = dueDate.toLocaleTimeString("en-US", options);
            options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
            dateString += ", " + dueDate.toLocaleDateString("en-US", options);;
            var tooltip = "Due at " + dueDate.toString();
            data.dueDate = '<span '
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            data.dueDate += 'Due&nbsp;Date: ';
            data.dueDate += '<strong>';
            data.dueDate += dateString;
            data.dueDate += '</strong>';
            data.dueDate += '</span>';

            data.questionList = [];
            var qids = that.test.get("qids");
            var qDists = that.test.get("qDists");
            var userDist = that.model.get("dist");
            _(qids).each(function(qid, index) {
                var q = that.questions.get(qid);
                data.questionList.push({
                    qid: q.get("qid"),
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: q.get("title"),
                    number: index + 1,
                    fullNumber: "#" + hwNumber + "-" + (index + 1),
                    recommendBar: renderRecommendBar(modelData, qid),
                    difficultyBar: renderDifficultyBar(modelData, qid),
                    correctPoints: renderCorrectPoints(modelData, qid),
                    incorrectPoints: renderIncorrectPoints(modelData, qid),
                    attempts: renderAttempts(modelData, qid)
                });
            });
            var html = Mustache.render(template, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    var TestInstanceSidebarView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
            this.listenTo(this.tInstance, "change", this.render);
        },

        render: function() {
            var that = this;
            var template = this.test.get("templateSidebar");
            if (template === undefined)
                return;
            var data = {};
            data.title = this.test.get("title");
            var hwNumber = this.test.get("number");
            data.hwNumber = hwNumber;
            data.hwScore = renderHWScore(this.tInstance);
            data.tiid = this.tInstance.get("tiid");

            var modelData = this.tInstance.get("modelData");
            data.masteryScore = renderMasteryScore(modelData);
            data.masteryBar = renderMasteryBar(modelData);

            var qid = this.model.get("qid");
            var qids = that.test.get("qids");
            var qIndex = _.indexOf(qids, qid);

            data.qNumber = qIndex + 1;
            data.qFullNumber = "#" + hwNumber + "-" + (qIndex + 1);
            data.prevQNumber = null;
            data.nextQNumber = null;
            if (qIndex > 0)
                data.prevQNumber = qIndex;
            if (qIndex < qids.length - 1)
                data.nextQNumber = qIndex + 2;

            data.recommendBar = renderRecommendBar(modelData, qid);
            data.difficultyBar = renderDifficultyBar(modelData, qid);
            data.correctPoints = renderCorrectPoints(modelData, qid);
            data.incorrectPoints = renderIncorrectPoints(modelData, qid);
            data.attempts = renderAttempts(modelData, qid);

            var html = Mustache.render(template, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    var TestHelper = function() {
        this.queue = new PrairieQueue.PrairieQueue();
        this.rand = new PrairieRandom.RandomGenerator();
    };

    TestHelper.prototype.chooseRandomQuestion = function(qInfo, test, tInstance, skipQIDs) {
        skipQIDs = (skipQIDs === undefined) ? [] : skipQIDs;
        var qids = test.get("qids");
        var qDists = test.get("qDists");
        var userDist = tInstance.get("dist");

        var tmpUserDist = JSON.parse(JSON.stringify(userDist));

        // FIXME: only works for 1D sigmas
        switch (qInfo) {
        case "randomEasy":
            tmpUserDist.sigma.mean[0] -= 2 * tmpUserDist.sigma.covariance[0][0];
            break;
        case "randomHard":
            tmpUserDist.sigma.mean[0] += 2 * tmpUserDist.sigma.covariance[0][0];
            break;
        }

        var modelData = computeModelData(qids, qDists, tmpUserDist, test.get("initAvgProb"));
        console.log(skipQIDs);
        var qidsWithProbs = _.chain(qids)
            .difference(skipQIDs)
            .map(function(qid) {return {qid: qid, prob: modelData.qData[qid].recommend};})
            .sortBy("prob")
            .last(5)
            .value();
        var qid = this.rand.randElem(_(qidsWithProbs).pluck("qid"), _(qidsWithProbs).pluck("prob"));
        var qIndex = _(qids).indexOf(qid);
        return qIndex;
    };

    TestHelper.prototype.formatQNumber = function(qid, test, tInstance) {
        var hwNumber = test.get("number");
        var qids = test.get("qids");
        var qIndex = _(qids).indexOf(qid);
        return "#" + hwNumber + "-" + (qIndex + 1);
    };

    TestHelper.prototype.computeModelData = function(tInstance, test) {
        var qids = test.get("qids");
        var qDists = test.get("qDists");
        var userDist = tInstance.get("dist");
        var modelData = computeModelData(qids, qDists, userDist, test.get("initAvgProb"));
        return modelData;
    };

    TestHelper.prototype.adjustQuestionDataModel = function(questionDataModel, tInstance, test) {
        questionDataModel.set("allowPractice", true);
    };

    return {
        TestInstanceView: TestInstanceView,
        TestInstanceSidebarView: TestInstanceSidebarView,
        TestHelper: TestHelper
    };
});

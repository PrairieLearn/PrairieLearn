
define(["underscore", "PrairieRandom"], function(_, PrairieRandom) {

    var AdaptiveTestClient = function() {
        this.rand = new PrairieRandom.RandomGenerator();
    };

    AdaptiveTestClient.prototype.chooseRandomQuestion = function(qInfo, test, tInstance, skipQIDs) {
        skipQIDs = (skipQIDs === undefined) ? [] : skipQIDs;
        var qids = test.get("qids");
        var modelData = tInstance.get("modelData");
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

    AdaptiveTestClient.prototype.formatQNumber = function(qid, test, tInstance) {
        var hwNumber = test.get("number");
        var qids = test.get("qids");
        var qIndex = _(qids).indexOf(qid);
        return "#" + hwNumber + "-" + (qIndex + 1);
    };

    AdaptiveTestClient.prototype.adjustQuestionDataModel = function(questionDataModel, tInstance, test) {
        questionDataModel.set("allowPractice", true);
    };

    return new AdaptiveTestClient();
});

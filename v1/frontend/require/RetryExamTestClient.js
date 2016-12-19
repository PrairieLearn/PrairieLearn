
define(["underscore"], function(_) {

    var RetryExamTestClient = function() {
    };

    RetryExamTestClient.prototype.formatQNumber = function(qid, test, tInstance) {
        var qids = tInstance.get("qids");
        var qIndex = _(qids).indexOf(qid);
        return "#" + (qIndex + 1);
    };

    return new RetryExamTestClient();
});


define(["underscore"], function(_) {

    var BasicTestClient = function() {
    };

    BasicTestClient.prototype.formatQNumber = function(qid, test, tInstance) {
        var hwNumber = test.get("number");
        if (tInstance.get("shuffled")) {
            var qids = tInstance.get("qids");
            var qIndex = _(qids).indexOf(qid);
            return "#" + hwNumber + "." + tInstance.get("uniqueIds")[qIndex];
        }
        else {
            var qids = test.get("qids");
            var qIndex = _(qids).indexOf(qid);
            return "#" + hwNumber + "." + (qIndex + 1);
        }
    };

    return new BasicTestClient();
});

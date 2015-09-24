
define(["underscore"], function(_) {

    var GameTestClient = function() {
    };

    GameTestClient.prototype.formatQNumber = function(qid, test, tInstance) {
        var hwNumber = test.get("number");
        var qids = test.get("qids");
        var qIndex = _(qids).indexOf(qid);
        return "#" + hwNumber + "." + (qIndex + 1);
    };

    return new GameTestClient();
});

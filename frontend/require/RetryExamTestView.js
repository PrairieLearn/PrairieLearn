
define(["underscore", "backbone", "mustache", "RetryExamTestHelper", "text!RetryExamTestView.html"], function(_, Backbone, Mustache, RetryExamTestHelper, RetryExamTestViewTemplate) {

    var RetryExamTestView = Backbone.View.extend({
        tagName: 'div',

        initialize: function() {
            this.tInstances = this.options.tInstances;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.tInstances, "change", this.render);
        },

        render: function() {
            var that = this;
            var testOptions = this.model.get("options");

            var data = {};
            data.set = this.model.get("set");
            data.number = this.model.get("number");
            data.title = this.model.get("title");
            data.tid = this.model.get("tid");

            var tInstance = this.tInstances.findWhere({tid: this.model.get("tid")});
            if (tInstance === undefined)
                return;
            data.tiid = tInstance.get("tiid");
            data.open = tInstance.get("open");
            var qids = tInstance.get("qids");
            data.nQuestions = qids.length;
            data.maxScore = tInstance.get("maxScore");
            data.score = tInstance.get("score");
            data.correctPercentage = (data.score / data.maxScore * 100).toFixed(0);
            data.incorrectPercentage = 100 - data.correctPercentage;
            if (data.open) {
                var submissionsByQid = tInstance.get("submissionsByQid");
                data.nSaved = _(qids).filter(function(qid) {return _(submissionsByQid).has(qid);}).length;
                data.haveSaved = (data.nSaved > 0);
            } else {
                var finishDate = new Date(tInstance.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
            }

            var html = Mustache.render(RetryExamTestViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },
    });

    return RetryExamTestView;
});

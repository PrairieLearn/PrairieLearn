
define(["underscore", "backbone", "mustache", "RetryExamTestHelper", "text!RetryExamTestSidebarView.html"], function(_, Backbone, Mustache, RetryExamTestHelper, RetryExamTestSidebarViewTemplate) {

    var RetryExamTestSidebarView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.store = this.options.store;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
            this.listenTo(this.tInstance, "change", this.render);
        },

        render: function() {
            var data = {};
            data.tid = this.tInstance.get("tid");
            data.tiid = this.tInstance.get("tiid");
            data.tiNumber = this.tInstance.get("number");
            data.testShortName = this.store.tiidShortName(data.tiid);

            var qid = this.model.get("qid");
            var qids = this.tInstance.get("qids");
            var qIndex = _.indexOf(qids, qid);
            data.qNumber = qIndex + 1;
            data.questionTitle = "Question #" + data.qNumber;
            data.prevQNumber = null;
            data.nextQNumber = null;
            if (qIndex > 0)
                data.prevQNumber = qIndex;
            if (qIndex < qids.length - 1)
                data.nextQNumber = qIndex + 2;

            data.nQuestions = qids.length;
            data.open = this.tInstance.get("open");
            data.maxScore = this.tInstance.get("maxScore");
            data.score = this.tInstance.get("score");
            data.correctPercentage = this.tInstance.get("scorePerc");
            var submissionsByQid = this.tInstance.get("submissionsByQid");
            var questionsByQID = this.tInstance.get("questionsByQID");
            var submission = submissionsByQid[qid];
            var question = questionsByQID[qid];
            _(data).extend(RetryExamTestHelper.getQuestionData(submission, question, data.open));

            if (!data.open) {
                var finishDate = new Date(this.tInstance.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
                data.showQuestionScore = false;
                if (_(submissionsByQid).has(qid)) {
                    var submission = submissionsByQid[qid];
                    data.showQuestionScore = true;
                    data.questionScore = (submission.score * 100).toFixed(0);
                }
            }

            var html = Mustache.render(RetryExamTestSidebarViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return RetryExamTestSidebarView;
});

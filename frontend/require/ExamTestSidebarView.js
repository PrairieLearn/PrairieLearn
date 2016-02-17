
define(["underscore", "backbone", "mustache", "ExamTestHelper", "text!ExamTestSidebarView.html"], function(_, Backbone, Mustache, ExamTestHelper, ExamTestSidebarViewTemplate) {

    var ExamTestSidebarView = Backbone.View.extend({

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
            var submissionsByQid = this.tInstance.get("submissionsByQid");
            if (data.open) {
                data.nSaved = _(qids).filter(function(qid) {return _(submissionsByQid).has(qid);}).length;
            } else {
                var finishDate = new Date(this.tInstance.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
                data.nCorrect = this.tInstance.get("score");
                data.correctPercentage = (data.nCorrect / data.nQuestions * 100).toFixed(0);
                data.showQuestionScore = false;
                data.questionGrade = '<span class="label label-default">not answered</span>';
                if (_(submissionsByQid).has(qid)) {
                    var submission = submissionsByQid[qid];
                    data.showQuestionScore = true;
                    data.questionScore = (submission.score * 100).toFixed(0);
                    if (submission.score >= 0.5)
                        data.questionGrade = '<span class="label label-success">correct</span>';
                    else
                        data.questionGrade = '<span class="label label-danger">incorrect</span>';
                }
            }

            var html = Mustache.render(ExamTestSidebarViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return ExamTestSidebarView;
});

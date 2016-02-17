
define(["underscore", "backbone", "mustache", "PrairieTemplate", "RetryExamTestHelper", "text!RetryExamTestInstanceView.html"], function(_, Backbone, Mustache, PrairieTemplate, RetryExamTestHelper, RetryExamTestInstanceViewTemplate) {

    var RetryExamTestInstanceView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .gradeExam": "gradeExam",
            "click .finishExam": "finishExam",
        },

        initialize: function() {
            this.store = this.options.store;
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.tid = this.model.get("tid");
            data.tiid = this.model.get("tiid");
            data.tiNumber = this.model.get("number");
            data.longName = this.store.tiidLongName(data.tiid);

            var qids = that.model.get("qids");
            data.nQuestions = qids.length;
            data.maxScore = this.model.get("maxScore");
            data.score = this.model.get("score");
            data.correctPercentage = this.model.get("scorePerc");

            var text = this.test.get("text");
            if (text) {
                data.text = PrairieTemplate.template(text, {}, undefined, this.appModel, this.model);
            }

            data.open = this.model.get("open");
            if (!data.open) {
                var finishDate = new Date(this.model.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
            }

            var text = this.test.get("text");
            if (text) {
                data.text = PrairieTemplate.template(text, {}, undefined, this.appModel, this.model);
            }

            var submissionsByQid = this.model.get("submissionsByQid");
            var questionsByQID = this.model.get("questionsByQID");
            data.nSaved = _(qids).filter(function(qid) {return _(submissionsByQid).has(qid);}).length;

            data.questionList = [];
            var showZoneTitles = that.model.has("showZoneTitles") && that.model.get("showZoneTitles");
            var questions = this.model.get("questions");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                if (showZoneTitles) {
                    var zones = that.model.get("zones");
                    if (zones[index]) {
                        var entry = {
                            title: '<strong>' + zones[index] + '</strong>',
                        };
                        data.questionList.push(entry);
                    }
                }
                var tid = that.model.get("tid");
                var tiid = that.model.get("tiid");
                var tiNumber = that.model.get("number");
                var number = index + 1;
                var entry = {
                    title: '<a href="#q/' + tid + '/' + tiNumber + '/' + number + '">Question #' + number + '</a>',
                };
                submission = submissionsByQid[qid];
                questionData = questionsByQID[qid];
                _(entry).extend(RetryExamTestHelper.getQuestionData(submission, questionData, data.open));
                data.questionList.push(entry);
            });

            var html = Mustache.render(RetryExamTestInstanceViewTemplate, data);
            this.$el.html(html);
        },

        gradeExam: function() {
            var that = this;
            this.$('#confirmGradeModal').on('hidden.bs.modal', function (e) {
                that.trigger("gradeTest");
            })
            this.$("#confirmGradeModal").modal('hide');
        },

        finishExam: function() {
            var that = this;
            this.$('#confirmFinishModal').on('hidden.bs.modal', function (e) {
                that.trigger("finishTest");
            })
            this.$("#confirmFinishModal").modal('hide');
        },

        close: function() {
            this.remove();
        }
    });

    return RetryExamTestInstanceView;
});

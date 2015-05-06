
define(["underscore", "backbone", "mustache", "RetryExamTestHelper", "text!RetryExamTestInstanceView.html"], function(_, Backbone, Mustache, RetryExamTestHelper, RetryExamTestInstanceViewTemplate) {

    var RetryExamTestInstanceView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .gradeExam": "gradeExam",
            "click .finishExam": "finishExam",
        },

        initialize: function() {
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.title = this.test.get("title");
            data.number = this.model.get("number");
            data.tiid = this.model.get("tiid");

            var qids = that.model.get("qids");
            data.nQuestions = qids.length;
            data.maxScore = this.model.get("maxScore");
            data.score = this.model.get("score");
            data.correctPercentage = (data.score / data.maxScore * 100).toFixed(0);

            data.open = this.model.get("open");
            if (!data.open) {
                var finishDate = new Date(this.model.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
            }

            var submissionsByQid = this.model.get("submissionsByQid");
            var questionsByQID = this.model.get("questionsByQID");
            data.nSaved = _(qids).filter(function(qid) {return _(submissionsByQid).has(qid);}).length;

            data.questionList = [];
            _(qids).each(function(qid, index) {
                var q = that.questions.get(qid);
                var entry = {
                    qid: q.get("qid"),
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: q.get("title"),
                    number: index + 1,
                };
                if (data.open) {
                    submission = submissionsByQid[qid];
                    question = questionsByQID[qid];
                    entry.availablePoints = question.points[question.nGradedAttempts];
                    entry.remainingAttempts = question.points.length - question.nGradedAttempts;
                    if (submission !== undefined) {
                        if (submission.graded) {
                            if (submission.correct) {
                                entry.questionStatus = '<span class="label label-success">correct</span>';
                                entry.points = question.awardedPoints;
                            } else {
                                entry.questionStatus = '<span class="label label-danger">incorrect</span>';
                            }
                        } else {
                            entry.questionStatus = '<span class="label label-primary">saved</span>';
                        }
                    } else {
                        entry.questionStatus = '<span class="label label-default">no answer</span>';
                        
                    }
                } else {
                    entry.grade = '<span class="label label-default">not answered</span>';
                    if (_(submissionsByQid).has(qid)) {
                        var submission = submissionsByQid[qid];
                        if (submission.score >= 0.5)
                            entry.grade = '<span class="label label-success">correct</span>';
                        else
                            entry.grade = '<span class="label label-danger">incorrect</span>';
                    }
                }
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

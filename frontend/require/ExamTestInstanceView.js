
define(["underscore", "backbone", "mustache", "PrairieTemplate", "ExamTestHelper", "text!ExamTestInstanceView.html"], function(_, Backbone, Mustache, PrairieTemplate, ExamTestHelper, ExamTestInstanceViewTemplate) {

    var ExamTestInstanceView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .gradeExam": "gradeExam",
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
            data.tiid = this.model.get("tiid");
            data.longName = this.store.tiidLongName(data.tiid);

            var qids = that.model.get("qids");
            data.nQuestions = qids.length;

            data.open = this.model.get("open");
            if (!data.open) {
                var finishDate = new Date(this.model.get("finishDate"));
                var options = {hour: "numeric", minute: "numeric"};
                var dateString = finishDate.toLocaleTimeString("en-US", options);
                options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                data.finishDate = dateString;
                data.nCorrect = this.model.get("score");
                data.correctPercentage = (data.nCorrect / data.nQuestions * 100).toFixed(0);
            }

            var text = this.test.get("text");
            if (text) {
                data.text = PrairieTemplate.template(text, {}, undefined, this.appModel, this.model);
            }

            var submissionsByQid = this.model.get("submissionsByQid");
            data.nSaved = _(qids).filter(function(qid) {return _(submissionsByQid).has(qid);}).length;

            data.questionList = [];
            var questions = this.model.get("questions");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                var entry = {
                    qid: qid,
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: question.title,
                    number: index + 1,
                };
                if (data.open) {
                    if (_(submissionsByQid).has(qid))
                        entry.saveStatus = '<span class="label label-success">saved</span>';
                    else
                        entry.saveStatus = '<span class="label label-danger">not saved</span>';
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

            var html = Mustache.render(ExamTestInstanceViewTemplate, data);
            this.$el.html(html);
        },

        gradeExam: function() {
            var that = this;
            this.$('#confirmModal').on('hidden.bs.modal', function (e) {
                that.trigger("finishTest");
            })
            this.$("#confirmModal").modal('hide');
        },

        close: function() {
            this.remove();
        }
    });

    return ExamTestInstanceView;
});


define(['underscore', 'backbone', 'mustache', 'spinController', 'TestFactory', 'text!QuestionBodyView.html'], function(_, Backbone, Mustache, spinController, TestFactory, questionBodyViewTemplate) {

    var QuestionBodyView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change:qClient", this.render);
            this.render();
        },

        render: function() {
            var that = this;
            var qid = this.model.get("qid");

            var testClient = TestFactory.getClass(this.test.get("type"), "client");
            var qTitle = this.model.get("title");
            var qNumber = testClient.formatQNumber(qid, this.test, this.tInstance);
            var title;
            if (this.model.get("showTitle")) {
                title = qNumber + ". " + qTitle;
            } else {
                number = "Question " + number;
                if (this.tInstance.has("open") && this.tInstance.get("open"))
                    title = qNumber;
                else
                    title = qNumber + ". " + qTitle;
            }
            if (this.model.appModel.hasPermission("seeQID"))
                title += " (" + this.model.get("qid") + ")";
            var data = {
                title: title,
            };
            var html = Mustache.render(questionBodyViewTemplate, data);
            this.$el.html(html);

            var qClient = this.model.get("qClient");
            if (qClient == null) {
                if (!this.spinner) {
                    var el = document.getElementById("qbody-spinner");
                    this.spinner = spinController.startSpinner(el);
                }
                return;
            }
            if (this.spinner) {
                spinController.stopSpinner(this.spinner);
            }
            qClient.renderQuestion("#qInnerBody", function() {
                that.model.set("submittable", qClient.isComplete());
                that.model.trigger("answerChanged");
            });

            // restore submittedAnswer from most recent submission if we have one
            if (this.tInstance.has("submissionsByQid")) {
                var submissionsByQid = this.tInstance.get("submissionsByQid");
                var submission = submissionsByQid[qid];
                if (submission) {
                    if (qClient.setSubmittedAnswer) {
                        qClient.setSubmittedAnswer(submission.submittedAnswer);
                        this.model.updateDirtyStatus();
                    }
                    if (_(submission).has("score")) {
                        this.model.set("score", submission.score);
                    }
                    if (_(submission).has("trueAnswer")) {
                        if (qClient.showSolution) {
                            qClient.showSolution(submission.trueAnswer);
                        }
                    }
                }
            }
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionBodyView: QuestionBodyView
    };
});

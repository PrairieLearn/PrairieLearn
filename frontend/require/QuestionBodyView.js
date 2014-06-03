
define(['underscore', 'backbone', 'spinController'], function(_, Backbone, spinController) {

    var QuestionBodyView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change:qClient", this.render);
            this.render();
        },

        render: function() {
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
            var that = this;
            qClient.renderQuestion("#qbody", function() {
                that.model.set("submittable", qClient.isComplete());
                that.model.trigger("answerChanged");
            });

            // restore submittedAnswer from most recent submission if we have one
            var tiid = this.model.get("tiid");
            var qid = this.model.get("qid");
            if (tiid != null) {
                var tInstance = this.model.tInstances.get(tiid);
                if (tInstance !== undefined && tInstance.has("submissionsByQid")) {
                    var submissionsByQid = tInstance.get("submissionsByQid");
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


define(['underscore', 'backbone', 'mustache', 'moment', 'text!QuestionSubmitView.html'], function(_, Backbone, Mustache, moment, questionSubmitViewTemplate) {

    var QuestionSubmitView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .submit": "submit",
            "click .submitPractice": "submitPractice",
            "click .submitCorrect": "submitCorrect",
            "click .submitIncorrect": "submitIncorrect",
            "click .save": "save",
            "click .tryAgain": "tryAgain",
        },

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "all", this.render);
        },

        submit: function() {
            this.model.submitAnswer();
        },

        submitPractice: function() {
            this.model.submitAnswer({practice: true});
        },

        submitCorrect: function() {
            this.model.submitAnswer({overrideScore: 1});
        },

        submitIncorrect: function() {
            this.model.submitAnswer({overrideScore: 0});
        },

        save: function() {
            this.model.saveAnswer();
        },

        tryAgain: function() {
            Backbone.trigger("tryAgain");
        },

        render: function() {
            if (this.tInstance) {
                var testOptions = this.test.get("options");
                var data = {
                    submittable: this.model.get("submittable"),
                    submitted: this.model.get("submitted"),
                    overridable: this.model.appModel.hasPermission("overrideScore"),
                    answerStatus: '<span class="label answer-not-saved">not saved</span>',
                    saveActive: false,
                    testOpen: true,
                };
                data.allowPractice = testOptions.allowPractice;
                data.allowQuestionSubmit = testOptions.allowQuestionSubmit;
                data.allowQuestionSave = testOptions.allowQuestionSave;
                data.allowQuestionRetry = testOptions.allowQuestionRetry;
                data.allowTryAgain = (this.model.get("score") != null);
                if (this.tInstance.has("open")) {
                    data.testOpen = this.tInstance.get("open");
                }
                data.questionOpen = data.testOpen;
            } else {
                var data = {
                    submittable: this.model.get("submittable"),
                    submitted: this.model.get("submitted"),
                    overridable: this.model.appModel.hasPermission("overrideScore"),
                    answerStatus: '<span class="label answer-not-saved">not saved</span>',
                    saveActive: false,
                    testOpen: true,
                    allowQuestionSubmit: true,
                    allowQuestionRetry: false,
                    questionOpen: true,
                };
                data.allowTryAgain = (this.model.get("score") != null);
            }

            var submissionsByQid, questionsByQID, submission, question;
            if (this.tInstance.has("submissionsByQid") && this.tInstance.has("questionsByQID")) {
                submissionsByQid = this.tInstance.get("submissionsByQid");
                questionsByQID = this.tInstance.get("questionsByQID");
                submission = submissionsByQid[this.model.get("qid")];
                question = questionsByQID[this.model.get("qid")];
            }

            if (data.allowQuestionSave) {
                if (this.model.get("saveInProgress")) {
                    data.answerStatus = '<span class="label answer-saving">saving...</span>';
                } else if (this.model.get("submitError")) {
                    data.answerStatus = '<span class="label answer-save-failed">save failed</span>';
                } else if (this.model.get("hasSavedSubmission") && this.model.get("dirtyData")) {
                    data.answerStatus = '<span class="label answer-not-saved">change not saved</span>';
                } else if (!this.model.get("dirtyData")) {
                    data.answerStatus = '<span class="label answer-saved">saved</span>';
                    if (data.allowQuestionRetry) {
                        if (question !== undefined) {
                            var remainingAttempts = question.points.length - question.nGradedAttempts;
                            if (remainingAttempts <= 0) {
                                data.questionOpen = false;
                            } else {
                                if (submission === undefined) {
                                    data.answerStatus = '<span class="label answer-none">no answer</span>';
                                } else {
                                    if (submission.graded) {
                                        if (submission.correct) {
                                            data.questionOpen = false;
                                        } else {
                                            data.answerStatus = '<span class="label answer-incorrect">incorrect</span>';
                                        }
                                    } else {
                                        data.answerStatus = '<span class="label answer-saved">saved</span>';
                                    }
                                }
                            }
                        }
                    }
                }
                if (this.model.get("dirtyData") && data.submittable)
                    data.saveActive = true;
            }

            if (submission && submission.date) {
                data.saveDate = submission.date;
                var dateDiff = (Date.now() - new Date(submission.date)) / 1000;
                data.saveDateHuman = moment(submission.date).calendar();
            }

            var html = Mustache.render(questionSubmitViewTemplate, data);
            this.$el.html(html);
            if (data.saveDate) {
                this.$el.find("time.submitDate").livestamp(moment(data.saveDate));
            }
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionSubmitView: QuestionSubmitView
    };
});

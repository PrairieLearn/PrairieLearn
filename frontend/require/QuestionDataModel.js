
define(['underscore', 'backbone', 'jquery', 'async'], function(_, Backbone, $, async) {

    var QuestionDataModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.appModel = options.appModel;
            this.tInstance = options.tInstance;
            this.test = options.test;
            this.set({
                qid: options.qid,
                vid: options.vid, // may be undefined
                qiid: null,
                title: null,
                number: null,
                video: null,
                qClient: null,
                showAnswer: false,
                showTitle: true,
                submittable: false,
                submitted: false,
                submitError: null,
                savedOverrideScore: null,
                savedPractice: false,
                saveInProgress: false,
                hasSavedSubmission: false,
                dirtyData: true,
                score: null,
                trueAnswer: null,
                feedback: null
            });
            var testOptions = this.test.get("options");
            if (testOptions.showQuestionTitle !== undefined)
                this.set("showTitle", testOptions.showQuestionTitle);
            this.listenTo(this.appModel, "change:userUID", this.loadQuestion);
            this.on("answerChanged", this.updateDirtyStatus);
            this.loadQuestion();
        },

        loadQuestion: function() {
            var uid = this.appModel.get("userUID");
            if (!uid) {
                return;
            }
            var that = this;
            var qid = this.get("qid");
            var vid = this.get("vid");
            $.getJSON(that.appModel.apiURL("questions/" + qid), function(data) {
                that.set({
                    "title": data.title,
                    "number": data.number,
                    "video": data.video
                });
            });
            var qInstance = {
                qid: qid,
                uid: uid,
                vid: vid, // may be undefined, server may ignore anyway
                tiid: this.tInstance.get("tiid"),
            };

            var processQInstance = function(qInstance) {
                var qiid = qInstance.qiid;
                that.set("qiid", qiid);
                require([that.appModel.apiURL("questions/" + qid + "/client.js")], function(qClient) {
                    qClient.initialize(qInstance.params);
                    that.set("qClient", qClient);

                    // restore submittedAnswer from most recent submission if we have one
                    if (that.tInstance.has("submissionsByQid")) {
                        var submissionsByQid = that.tInstance.get("submissionsByQid");
                        var submission = submissionsByQid[qid];
                        if (submission) {
                            if (qClient.setSubmittedAnswer) {
                                qClient.setSubmittedAnswer(submission.submittedAnswer);
                                that.updateDirtyStatus();
                            }
                            if (_(submission).has("score")) {
                                that.set("score", submission.score);
                            }
                            if (_(submission).has("trueAnswer")) {
                                qClient.setTrueAnswer(submission.trueAnswer);
                                that.set("showAnswer", true);
                            }
                            if (_(submission).has("feedback")) {
                                qClient.setFeedback(submission.feedback);
                            }
                        }
                    }
                });
            };

            var qiid = null;
            if (this.tInstance !== undefined && this.tInstance.has("qiidsByQid")) {
                // already have a QIID, so GET the qInstance
                var qiidsByQid = this.tInstance.get("qiidsByQid");
                var qiid = qiidsByQid[qid];
            }
            if (qiid) {
                $.getJSON(that.appModel.apiURL("qInstances/" + qiid), processQInstance);
            } else {
                // don't already have a QIID, so POST to create a new qInstance
                $.ajax({
                    dataType: "json",
                    url: that.appModel.apiURL("qInstances"),
                    type: "POST",
                    processData: false,
                    data: JSON.stringify(qInstance),
                    contentType: 'application/json; charset=UTF-8',
                    success: processQInstance,
                });
            }
        },

        submitAnswer: function(options) {
            options = _.defaults(options || {}, {
                overrideScore: null,
                practice: false,
                retry: false,
            });
            if (options.retry) {
                options.overrideScore = this.get("savedOverrideScore");
                options.practice = this.get("savedPractice");
            } else {
                this.set("savedOverrideScore", options.overrideScore);
                this.set("savedPractice", options.practice);
            }
            var submission = {};
            submission.uid = this.appModel.get("userUID");
            submission.qiid = this.get("qiid");
            var qClient = this.get("qClient");
            if (options.overrideScore === null) {
                submission.submittedAnswer = qClient.getSubmittedAnswer();
            } else {
                submission.overrideScore = options.overrideScore;
            }
            if (options.practice)
                submission.practice = true;
            this.set("submitError", false);
            this.set("submittable", false);
            this.set("submitted", true);
            var that = this;
            var successFn = function(submission) {
                that.set("score", submission.score);
                if (_(submission).has("trueAnswer")) {
                    qClient.setTrueAnswer(submission.trueAnswer);
                    that.set("showAnswer", true);
                }
                if (_(submission).has("feedback")) {
                    qClient.setFeedback(submission.feedback);
                }
                that.trigger("graded");
            };
            var errorFn = function(jqXHR, textStatus, errorThrown) {
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                that.set("submitError", e);
            };
            $.ajax({
                dataType: "json",
                url: that.appModel.apiURL("submissions"),
                type: "POST",
                processData: false,
                data: JSON.stringify(submission),
                contentType: 'application/json; charset=UTF-8',
                timeout: 7000,
                success: successFn,
                error: errorFn,
            });
        },

        updateDirtyStatus: function() {
            var testOptions = this.test.get("options");
            if (!testOptions.allowQuestionSave)
                return;

            if (!this.tInstance.has("submissionsByQid")) {
                this.set("hasSavedSubmission", false);
                this.set("dirtyData", true);
                return;
            }
            var submissionsByQid = this.tInstance.get("submissionsByQid");
            var qid = this.get("qid");
            var submission = submissionsByQid[qid];
            if (submission === undefined) {
                this.set("hasSavedSubmission", false);
                this.set("dirtyData", true);
                return;
            }
            this.set("hasSavedSubmission", true);

            var qClient = this.get("qClient");
            var submittedAnswer = qClient.getSubmittedAnswer();
            if (!_.isEqual(submission.submittedAnswer, submittedAnswer)) {
                this.set("dirtyData", true);
                return;
            }
            this.set("dirtyData", false);
        },

        saveAnswer: function() {
            var submission = {};
            submission.uid = this.appModel.get("userUID");
            submission.qid = this.get("qid");
            submission.tiid = this.tInstance.get("tiid");
            submission.qiid = this.get("qiid");
            var qClient = this.get("qClient");
            submission.submittedAnswer = qClient.getSubmittedAnswer();
            this.set("submitError", false);
            this.set("saveInProgress", true);
            var that = this;
            var successFn = function(submission) {
                that.set("saveInProgress", false);
                if (that.tInstance.has("submissionsByQid")) {
                    var submissionsByQid = that.tInstance.get("submissionsByQid");
                    submissionsByQid[submission.qid] = submission;
                }
                that.updateDirtyStatus();
            };
            var errorFn = function(jqXHR, textStatus, errorThrown) {
                that.set("saveInProgress", false);
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                that.set("submitError", e);
                that.updateDirtyStatus();
            };
            $.ajax({
                dataType: "json",
                url: that.appModel.apiURL("submissions"),
                type: "POST",
                processData: false,
                data: JSON.stringify(submission),
                contentType: 'application/json; charset=UTF-8',
                timeout: 7000,
                success: successFn,
                error: errorFn,
            });
        },
    });

    return {
        QuestionDataModel: QuestionDataModel
    };
});

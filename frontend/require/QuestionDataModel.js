
define(['underscore', 'backbone', 'jquery', 'async', 'SubmissionCollection'], function(_, Backbone, $, async, SubmissionCollection) {

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
                feedback: null,
				hasSubmissionTemplate: false,
				pastSubmissions: null,
				showSubmissions: false,
            });
            var testOptions = this.test.get("options");
            if (testOptions.showQuestionTitle !== undefined)
                this.set("showTitle", testOptions.showQuestionTitle);
            this.listenTo(this.appModel, "change:userUID", this.loadQuestion);
            this.on("answerChanged", this.updateDirtyStatus);
			this.on("pastSubmissionsReady", this.fetchSubmissions);
			this.on("pastSubmissionsFetched", this.checkShowSubmissions);
			this.on("newSubmission", this.fetchSubmissions);
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
            var qInstance = {
                qid: qid,
                uid: uid,
                vid: vid, // may be undefined, server may ignore anyway
            };
            if (this.tInstance) {
                qInstance.tiid = this.tInstance.get("tiid");
            } else if (this.test) {
                qInstance.tid = this.test.get("tid");
            }

            var processQInstance = function(qInstance) {
                that.set("qiid", qInstance.qiid);
                that.set("vid", qInstance.vid);
                that.set("title", qInstance.title);
                that.set("video", qInstance.video);
                require([that.appModel.apiURL("qInstances/" + qInstance.qiid + "/client.js")], function(qClient) {
                    qClient.initialize(qInstance.params);
                    that.set("qClient", qClient);
					
					if(qClient.hasSubmissionTemplate()) {
						that.set("hasSubmissionTemplate", true);
					}
					
					submissionURL = that.appModel.apiURL("submissions/?qiid="+qInstance.qiid);
					pastSubmissions = new SubmissionCollection.SubmissionCollection([],{
						qiid: qInstance.qiid,
						url: submissionURL,
					});
					that.set("pastSubmissions", pastSubmissions);
					that.trigger("pastSubmissionsReady");
					
                    // Show answer if it is public in the qInstance
                    // (i.e. the test has been finished)
                    if (_(qInstance).has("trueAnswer")) {
                        qClient.setTrueAnswer(qInstance.trueAnswer);
                        that.set("showAnswer", true);
                    }

                    // restore submittedAnswer from most recent submission if we have one
                    if (that.tInstance && that.tInstance.has("submissionsByQid")) {
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
                            if (_(submission).has("feedback")) {
                                qClient.setFeedback(submission.feedback);
                            }
                        }
                    }
                });
            };

            var processPostQInstance = function(qInstance) {
                that.tInstance.fetch({success: function() {
                    processQInstance(qInstance);
                }});
            };

            var qiid = null;
            if (this.tInstance && this.tInstance.has("qiidsByQid")) {
                var qiidsByQid = this.tInstance.get("qiidsByQid");
                var qiid = qiidsByQid[qid];
            }
            if (qiid) {
                // already have a QIID, so GET the qInstance
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
                    success: processPostQInstance,
                });
            }
        },
		
		fetchSubmissions: function() {
			var hasSubmissionTemplate = this.get("hasSubmissionTemplate");
			var pastSubmissions = this.get("pastSubmissions");
			that = this;
			if (hasSubmissionTemplate && pastSubmissions) {
				pastSubmissions.fetch({
					success: function() { that.trigger("pastSubmissionsFetched"); },
				});
			}
		},
	
		checkShowSubmissions: function() {
			this.set("showSubmissions", false);
			var hasSubmissionTemplate = this.get("hasSubmissionTemplate");
			var pastSubmissions = this.get("pastSubmissions");
			if (hasSubmissionTemplate && pastSubmissions && pastSubmissions.length > 0) {
				this.set("showSubmissions",true);
			}
			this.trigger("refreshSubmissionsView");
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
				that.trigger("newSubmission");
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
            if (!this.tInstance) return;
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
            this.set("newSubmission", true);

            var qClient = this.get("qClient");
            var submittedAnswer = qClient.getSubmittedAnswer();
            if (!_.isEqual(submission.submittedAnswer, submittedAnswer)) {
                this.set("dirtyData", true);
                return;
            }
            this.set("dirtyData", false);
        },

        saveAnswer: function() {
            if (!this.tInstance) return;
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
				that.trigger("newSubmission");
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

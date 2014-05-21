
define(['underscore', 'backbone'], function(_, Backbone) {

    var QuestionDataModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.requester = options.requester;
            this.appModel = options.appModel;
            this.tInstances = options.tInstances;
            this.set({
                qid: options.qid,
                tiid: options.tiid,
                vid: null,
                qiid: null,
                title: null,
                number: null,
                params: null,
                qTemplate: null,
                qClient: null,
                showTitle: true,
                submittable: false,
                submitted: false,
                submitError: null,
                savedOverrideScore: null,
                savedPractice: false,
                allowPractice: false,
                saveInProgress: false,
                allowSubmit: true,
                allowSave: false,
                hasSavedSubmission: false,
                dirtyData: true,
                score: null,
                trueAnswer: null
            });
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
            that.requester.getJSON(that.appModel.apiURL("questions/" + qid), function(data) {
                that.set({
                    "title": data.title,
                    "number": data.number
                });
            });
            var qInstance = {uid: uid, qid: qid};
            var tiid, tid, tInstance;
            if (this.get("tiid") != null) {
                tiid = this.get("tiid");
                qInstance.tiid = tiid;
                tInstance = this.tInstances.get(tiid);
                tid = tInstance.get("tid");
                qInstance.tid = tid;
            }

            var processQInstance = function(qInstance) {
                var qiid = qInstance.qiid;
                var vid = qInstance.vid;
                that.set("qiid", qiid);
                that.set("vid", vid);
                that.requester.getJSON(that.appModel.apiURL("questions/" + qid + "/" + vid + "/params"), function(params) {
                    that.set("params", params);
                });
                require([that.appModel.apiURL("questions/" + qid + "/" + vid + "/client.js")], function(qClient) {
                    that.set("qClient", qClient);
                });
                that.requester.getHtml(that.appModel.apiURL("questions/" + qid + "/" + vid + "/question.html"), function(qTemplate) {
                    that.set("qTemplate", qTemplate);
                });
            };

            if (tInstance !== undefined && tInstance.has("qiidsByQid")) {
                // already have a QIID, so GET the qInstance
                var qiidsByQid = tInstance.get("qiidsByQid");
                var qiid = qiidsByQid[qid];
                that.requester.getJSON(that.appModel.apiURL("qInstances/" + qiid), processQInstance);
            } else {
                // don't already have a QIID, so POST to create a new qInstance
                that.requester.postJSON(that.appModel.apiURL("qInstances"), qInstance, processQInstance);
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
            submission.qid = this.get("qid");
            submission.vid = this.get("vid");
            submission.tiid = this.get("tiid");
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
            this.requester.postJSONWithTimeout(that.appModel.apiURL("submissions"), submission, 7000, function(submission) {
                that.set("score", submission.score);
                if (qClient.showSolution !== undefined && submission.trueAnswer !== undefined) {
                    qClient.showSolution(submission.trueAnswer);
                }
                that.trigger("graded");
            }, function(jqXHR, textStatus, errorThrown) {
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                that.set("submitError", e);
            });
        },

        updateDirtyStatus: function() {
            if (!this.get("allowSave"))
                return;
            if (!this.get("tiid"))
                return;

            var qClient = this.get("qClient");
            var submittedAnswer = qClient.getSubmittedAnswer();

            var tiid = this.get("tiid");
            var tInstance = this.tInstances.get(tiid);
            if (!tInstance.has("submissionsByQid")) {
                this.set("hasSavedSubmission", false);
                this.set("dirtyData", true);
                return;
            }
            var submissionsByQid = tInstance.get("submissionsByQid");
            var qid = this.get("qid");
            var submission = submissionsByQid[qid];
            if (submission === undefined) {
                this.set("hasSavedSubmission", false);
                this.set("dirtyData", true);
                return;
            }
            this.set("hasSavedSubmission", true);
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
            submission.vid = this.get("vid");
            submission.tiid = this.get("tiid");
            submission.qiid = this.get("qiid");
            var qClient = this.get("qClient");
            submission.submittedAnswer = qClient.getSubmittedAnswer();
            this.set("submitError", false);
            this.set("saveInProgress", true);
            var that = this;
            this.requester.postJSONWithTimeout(that.appModel.apiURL("submissions"), submission, 7000, function(submission) {
                that.set("saveInProgress", false);
                var tiid, tInstance;
                if (that.get("tiid") != null) {
                    tiid = that.get("tiid");
                    tInstance = that.tInstances.get(tiid);
                    if (tInstance.has("submissionsByQid")) {
                        var submissionsByQid = tInstance.get("submissionsByQid");
                        submissionsByQid[submission.qid] = submission;
                    }
                }
                that.updateDirtyStatus();
            }, function(jqXHR, textStatus, errorThrown) {
                that.set("saveInProgress", false);
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                that.set("submitError", e);
                that.updateDirtyStatus();
            });
        },
    });

    return {
        QuestionDataModel: QuestionDataModel
    };
});

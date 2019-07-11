requirejs.config({
    baseUrl: '/localscripts/calculationQuestion',
    paths: {
        clientCode: document.urlPrefix + "/clientFilesCourse",
        clientFilesCourse: document.urlPrefix + "/clientFilesCourse",
    },
    map: {
        '*': {
            'numeric': 'numeric-1.2.6.min',
        }
    },
    waitSeconds: 60,
    shim: {
        'numeric-1.2.6.min': {
            exports: 'numeric'
        },
        'backbone': {
            deps: ['underscore', 'jquery'],
            exports: 'Backbone'
        },
        'underscore': {
            exports: '_'
        },
        'sha1': {
            exports: 'Sha1',
        },
        'jquery-ui': {
            deps: ['jquery']
        },
        'jquery.jsPlumb': {
            deps: ['jquery', 'jquery-ui']
        },
    },
    config: {
        text: {
            useXhr: function(url, protocol, hostname, port) {
                // see https://github.com/jrburke/requirejs/issues/269
                return true;
                // return true if you want to allow this url, given that the
                // text plugin thinks the request is coming from protocol, hostname, port.

                // unilaterally returning true here may mean that html
                // files aren't loaded from the optimized
                // one-big-js-file
            }
        },
    },
});

if (typeof jQuery === 'function') {
  //jQuery already loaded, just use that
  define('jquery', function() { return jQuery; });
}

function CalculationClient() {
    this.qClient = null;
};

CalculationClient.prototype.initialize = function(questionData, callback) {
    var that = this;
    requirejs(["backbone"], function(Backbone) {
        require([questionData.questionFilePath + "/client.js"], function(qc) {
            that.questionDataModel = new Backbone.Model();
            that.questionDataModel.set('questionFilePath', questionData.questionFilePath);
            that.questionDataModel.set('questionGeneratedFilePath', questionData.questionGeneratedFilePath);
            that.appModel = new Backbone.Model();
            that.qClient = qc;
            that.qClient.initialize(questionData.variant.params);
            if (questionData.submittedAnswer) {
                that.qClient.setSubmittedAnswer(questionData.submittedAnswer);
            }
            if (questionData.trueAnswer) {
                that.qClient.setTrueAnswer(questionData.trueAnswer);
            }
            if (questionData.feedback) {
                that.qClient.setFeedback(questionData.feedback);
            }
            callback(null);
        });
    });
};

CalculationClient.prototype.renderQuestion = function(container, questionData) {
    this.qClient.renderQuestion(container, function() {}, this.questionDataModel, this.appModel);
};

CalculationClient.prototype.renderSubmission = function(container, questionData, submissionIndex) {
    this.qClient.renderSubmission(container, this.questionDataModel, this.appModel, questionData.submissions[submissionIndex].submitted_answer, questionData.submissions[submissionIndex].feedback, submissionIndex);
};

CalculationClient.prototype.renderAnswer = function(container, questionData) {
    this.qClient.renderAnswer(container, this.questionDataModel, this.appModel);
};

CalculationClient.prototype.getSubmittedAnswer = function(container, questionData) {
    return this.qClient.getSubmittedAnswer();
};

document.questionClients = document.questionClients || {};
document.questionClients.Calculation = CalculationClient;

var PRAIRIELEARN_DEFAULT_API_SERVER = "http://localhost:3000";

requirejs.config({
    baseUrl: '/localscripts/backboneQuestion',
    paths: {
        clientCode: PRAIRIELEARN_DEFAULT_API_SERVER + "/clientCode",
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

document.questionClients = document.questionClients || {};

document.questionClients.Backbone = {};
var client = document.questionClients.Backbone;

client.initialize = function(callback) {
    var qClient;
    
    requirejs([], function() {
        
        client.renderQuestion = function(container, questionData) {
            require([questionData.questionFilePath + "/client.js"], function(qc) {
                qClient = qc;
                qClient.initialize(questionData.questionInstance.params);
                var questionDataModel = new Backbone.Model();
                var appModel = new Backbone.Model();
                qClient.renderQuestion(container, function() {}, questionDataModel, appModel);
            });
        };

        client.getSubmittedAnswer = function(container, questionData) {
            return qClient.getSubmittedAnswer();
        };

        callback(null);
    });
};


define(['underscore', 'backbone', 'mustache', 'renderer', 'text!DebugView.html'], function(_, Backbone, Mustache, renderer, DebugViewTemplate) {

    var DebugView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.tests = this.options.tests;
            this.questions = this.options.questions;
            this.tInstances = this.options.tInstances;
        },

        render: function() {
            var that = this;
            var data = {};
            data.testList = [];
            this.tInstances.each(function(tInstance) {
                var tid = tInstance.get("tid");
                var test = that.tests.get(tid);
                var testData = {
                    number: "HW " + test.get("number"),
                    userData: JSON.stringify(tInstance.get("dist")),
                    questionList: []
                };
                data.testList.push(testData);
                var qids = test.get("qids");
                var qDists = test.get("qDists");
                _(qids).each(function(qid, qIndex) {
                    var questionData = {
                        number: qIndex + 1,
                        dist: JSON.stringify(qDists[qid])
                    };
                    testData.questionList.push(questionData);
                });
            });
            var html = Mustache.render(DebugViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return DebugView;
});

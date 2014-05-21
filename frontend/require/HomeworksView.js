
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!HomeworksView.html'], function(_, Backbone, Mustache, renderer, HomeworksViewTemplate) {

    var HomeworksView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.tests = this.options.tests;
            this.questions = this.options.questions;
            this.tInstances = this.options.tInstances;
            this.listenTo(this.tInstances, "change", this.render);
            this.listenTo(this.tInstances, "sync", this.render);
            this.listenTo(this.tests, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.testList = [];
            this.tests.each(function(test) {
                if (test.get("type") !== "homework")
                    return;
                data.testList.push({
                    tid: test.get("tid")
                });
            });
            var html = Mustache.render(HomeworksViewTemplate, data);
            this.$el.html(html);

            this.subViews = [];
            this.tests.each(function(test) {
                if (test.get("type") !== "homework")
                    return;
                if (!test.has("client"))
                    return;
                var client = test.get("client");
                var tid = test.get("tid");
                var tInstance = that.tInstances.find(function(tI) {return tI.get("tid") === tid;});
                if (tInstance === undefined)
                    return;
                var tiid = tInstance.get("tiid");
                var subView = new client.TestInstanceView({model: tInstance, test: test, questions: that.questions});
                that.subViews.push(subView);
                subView.render();
                that.$("#" + tid).html(subView.el);
            });
        },

        close: function() {
            if (this.subViews) {
                _(this.subViews).each(function(subView) {
                    subView.close();
                });
            }
            this.remove();
        }
    });

    return HomeworksView;
});

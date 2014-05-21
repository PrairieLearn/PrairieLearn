
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!TestInstanceView.html'], function(_, Backbone, Mustache, renderer, TestInstanceViewTemplate) {

    var TestInstanceView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "all", this.render);
            this.listenTo(this.test, "all", this.render);
        },

        render: function() {
            var data = {};
            var html = Mustache.render(TestInstanceViewTemplate, data);
            this.$el.html(html);

            if (!this.test.has("client"))
                return;
            var client = this.test.get("client");
            this.subView = new client.TestInstanceView({model: this.model, test: this.test, questions: this.questions});
            this.listenTo(this.subView, "finishTest", this.gradeTInstance.bind(this));
            this.subView.render();
            this.$("#tInstance").html(this.subView.el);
        },

        gradeTInstance: function() {
            var that = this;
            this.model.save({open: false}, {patch: true, wait: true, success: function() {
                that.test.fetch();
            }});
        },

        close: function() {
            if (this.subView) {
                this.subView.close();
            }
            this.remove();
        }
    });

    return TestInstanceView;
});

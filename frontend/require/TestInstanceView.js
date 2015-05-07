
define(['underscore', 'backbone', 'mustache', 'renderer', 'TestFactory', 'text!TestInstanceView.html'], function(_, Backbone, Mustache, renderer, TestFactory, TestInstanceViewTemplate) {

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

            var TestInstanceView = TestFactory.getClass(this.test.get("type"), "tInstanceView");
            if (!TestInstanceView)
                return;
            this.subView = new TestInstanceView({model: this.model, test: this.test, questions: this.questions});
            this.listenTo(this.subView, "gradeTest", this.gradeTInstance.bind(this));
            this.listenTo(this.subView, "finishTest", this.finishTInstance.bind(this));
            this.subView.render();
            this.$("#tInstance").html(this.subView.el);
        },

        gradeTInstance: function() {
            var that = this;
            this.model.save({graded: true}, {patch: true, wait: true, success: function() {
                that.test.fetch();
            }});
        },

        finishTInstance: function() {
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

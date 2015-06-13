
define(['underscore', 'backbone', 'mustache', 'TestFactory', 'text!QuestionView.html', 'QuestionBodyView', 'QuestionSubmitView', 'QuestionGradingView', 'QuestionAnswerView'], function(_, Backbone, Mustache, TestFactory, questionViewTemplate, QuestionBodyView, QuestionSubmitView, QuestionGradingView, QuestionAnswerView) {

    var QuestionView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change:title", this.render);
            this.listenTo(this.test, "change:helper", this.render);
            this.listenTo(this.model, "graded", this.test.fetch.bind(this.test));
            this.listenTo(this.model, "graded", this.tInstance.fetch.bind(this.tInstance));
            this.render();
        },

        render: function() {
            this.$el.html(questionViewTemplate);

            var TestSidebarView = TestFactory.getClass(this.test.get("type"), "sidebarView");
            this.questionSidebarView = new TestSidebarView({model: this.model, test: this.test, tInstance: this.tInstance});
            this.questionBodyView = new QuestionBodyView.QuestionBodyView({model: this.model, test: this.test, tInstance: this.tInstance, appModel: this.appModel});
            this.questionSubmitView = new QuestionSubmitView.QuestionSubmitView({model: this.model, test: this.test, tInstance: this.tInstance});
            this.questionGradingView = new QuestionGradingView.QuestionGradingView({model: this.model});
            this.questionAnswerView = new QuestionAnswerView.QuestionAnswerView({model: this.model});
            this.questionBodyView.render();
            this.questionSubmitView.render();
            this.questionGradingView.render();
            this.questionAnswerView.render();

            this.$("#qbody").html(this.questionBodyView.el);
            this.$("#qsidebar").html(this.questionSidebarView.el);
            this.$("#qsubmit").html(this.questionSubmitView.el);
            this.$("#qgrading").html(this.questionGradingView.el);
            this.$("#qanswer").html(this.questionAnswerView.el);
        },

        close: function() {
            var qClient = this.model.get("qClient");
            if (qClient) {
                qClient.close();
            }
            if (this.questionBodyView) {
                this.questionBodyView.close();
            }
            if (this.questionSidebarView) {
                this.questionSidebarView.close();
            }
            if (this.questionSubmitView) {
                this.questionSubmitView.close();
            }
            if (this.questionGradingView) {
                this.questionGradingView.close();
            }
            if (this.questionAnswerView) {
                this.questionAnswerView.close();
            }
            this.remove();
        }
    });

    return {
        QuestionView: QuestionView
    };
});

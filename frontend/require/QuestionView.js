
define(['underscore', 'backbone', 'mustache', 'TestFactory', 'text!QuestionView.html', 'QuestionBodyView', 'QuestionSubmitView', 'QuestionGradingView', 'QuestionAnswerView', 'QuestionSubmissionsView', 'DefaultTestSidebarView'], function(_, Backbone, Mustache, TestFactory, questionViewTemplate, QuestionBodyView, QuestionSubmitView, QuestionGradingView, QuestionAnswerView, QuestionSubmissionsView, DefaultTestSidebarView) {

    var QuestionView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.store = this.options.store;
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change:title", this.render);
            this.listenTo(this.test, "change:helper", this.render);
            this.listenTo(this.model, "graded", this.test.fetch.bind(this.test));
            if (this.tInstance) {
                this.listenTo(this.model, "graded", this.tInstance.fetch.bind(this.tInstance));
            }
            this.render();
        },

        render: function() {
            this.$el.html(questionViewTemplate);

            var TestSidebarView;
            if (this.tInstance) {
                TestSidebarView = TestFactory.getClass(this.test.get("type"), "sidebarView");
            } else {
                TestSidebarView = DefaultTestSidebarView;
            }
            this.questionSidebarView = new TestSidebarView({model: this.model, test: this.test, tInstance: this.tInstance, store: this.store});
            this.questionBodyView = new QuestionBodyView.QuestionBodyView({model: this.model, test: this.test, tInstance: this.tInstance, appModel: this.appModel, store: this.store});
            this.questionSubmitView = new QuestionSubmitView.QuestionSubmitView({model: this.model, test: this.test, tInstance: this.tInstance, store: this.store});
            this.questionGradingView = new QuestionGradingView.QuestionGradingView({model: this.model, store: this.store});
            this.questionAnswerView = new QuestionAnswerView.QuestionAnswerView({model: this.model, store: this.store, appModel: this.appModel});
			this.questionSubmissionsView = new QuestionSubmissionsView.QuestionSubmissionsView({model: this.model, store: this.store});
            this.questionBodyView.render();
            this.questionSubmitView.render();
            this.questionGradingView.render();
            this.questionAnswerView.render();
			this.questionSubmissionsView.render();

            this.$("#qbody").html(this.questionBodyView.el);
            this.$("#qsidebar").html(this.questionSidebarView.el);
            this.$("#qsubmit").html(this.questionSubmitView.el);
            this.$("#qgrading").html(this.questionGradingView.el);
            this.$("#qanswer").html(this.questionAnswerView.el);
			this.$("#qsubmissions").html(this.questionSubmissionsView.el);
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
			if (this.questionSubmissionsView) {
				this.questionSubmissionsView.close();
			}
            this.remove();
        }
    });

    return {
        QuestionView: QuestionView
    };
});

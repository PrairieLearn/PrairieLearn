
define(['underscore', 'backbone', 'mustache', 'text!QuestionView.html', 'QuestionScoreView', 'QuestionBodyView', 'QuestionSubmitView', 'QuestionGradingView'], function(_, Backbone, Mustache, questionViewTemplate, QuestionScoreView, QuestionBodyView, QuestionSubmitView, QuestionGradingView) {

    var QuestionView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.qScore = this.options.qScore;
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change:title", this.render);
            if (this.test) {
                this.listenTo(this.test, "change:client", this.render);
                this.listenTo(this.test, "change:helper", this.render);
                this.listenTo(this.model, "graded", this.test.fetch.bind(this.test));
            }
            if (this.tInstance)
                this.listenTo(this.model, "graded", this.tInstance.fetch.bind(this.tInstance));
            if (this.qScore)
                this.listenTo(this.model, "graded", this.qScore.fetch.bind(this.qScore));
            this.render();
        },

        render: function() {
            var title = this.model.get("title");
            if (title == null)
                return;
            if (this.test && !this.test.has("client"))
                return;
            var number = "#" + this.model.get("number");
            if (this.test) {
                number = "";
                if (this.test.has("helper")) {
                    var qid = this.model.get("qid");
                    number = this.test.get("helper").formatQNumber(qid, this.test, this.tInstance);
                }
            }
            if (!this.model.get("showTitle")) {
                number = "Question " + number;
                if (this.tInstance && this.tInstance.has("open") && this.tInstance.get("open"))
                    title = "";
                else
                    number +=  ". ";
            } else {
                number +=  ". ";
            }
            if (this.model.appModel.hasPermission("seeQID"))
                title += " (" + this.model.get("qid") + ")";
            data = {title: title, number: number};
            var html = Mustache.render(questionViewTemplate, data);
            this.$el.html(html);

            if (this.test) {
                var client = this.test.get("client");
                this.questionScoreView = new client.TestInstanceSidebarView({model: this.model, test: this.test, tInstance: this.tInstance});
            } else {
                this.questionScoreView = new QuestionScoreView.QuestionScoreView({model: this.qScore});
            }
            this.questionBodyView = new QuestionBodyView.QuestionBodyView({model: this.model});
            this.questionSubmitView = new QuestionSubmitView.QuestionSubmitView({model: this.model, tInstance: this.tInstance});
            this.questionGradingView = new QuestionGradingView.QuestionGradingView({model: this.model});
            if (this.questionScoreView)
                this.questionScoreView.render();
            this.questionBodyView.render();
            this.questionSubmitView.render();
            this.questionGradingView.render();

            if (this.questionScoreView)
                this.$("#qscore").html(this.questionScoreView.el);
            this.$("#qsubmit").html(this.questionSubmitView.el);
            this.$("#qgrading").html(this.questionGradingView.el);
        },

        close: function() {
            if (this.questionScoreView) {
                this.questionScoreView.close();
            }
            if (this.questionBodyView) {
                this.questionBodyView.close();
            }
            if (this.questionSubmitView) {
                this.questionSubmitView.close();
            }
            if (this.questionGradingView) {
                this.questionGradingView.close();
            }
            this.remove();
        }
    });

    return {
        QuestionView: QuestionView
    };
});

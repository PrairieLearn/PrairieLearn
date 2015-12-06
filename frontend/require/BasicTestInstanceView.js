
define(["underscore", "backbone", "mustache", "PrairieTemplate", "BasicTestHelper", "text!BasicTestInstanceView.html"], function(_, Backbone, Mustache, PrairieTemplate, BasicTestHelper, BasicTestInstanceViewTemplate) {

    var BasicTestInstanceView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.store = this.options.store;
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.tiid = this.model.get("tiid");
            data.longName = this.store.tiidLongName(data.tiid);

            var dueDate = new Date(this.test.get("dueDate"));
            data.dueDate = BasicTestHelper.renderDueDate(dueDate);

            var score = this.model.get("score");
            data.score = BasicTestHelper.renderHWScore(score);
            data.scoreBar = BasicTestHelper.renderScoreBar(score);

            var text = this.test.get("text");
            if (text) {
                data.text = PrairieTemplate.template(text, {}, undefined, this.appModel, this.model);
            }

            data.questionList = [];
            var qids = this.test.get("qids");
            var qData = this.model.get("qData");
            var hwNumber = this.test.get("number");
            var questions = this.model.get("questions");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                data.questionList.push({
                    qid: qid,
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: question.title,
                    number: index + 1,
                    fullNumber: "#" + hwNumber + "." + (index + 1),
                    attempts: BasicTestHelper.renderQAttempts(qData[qid]),
                    score: BasicTestHelper.renderQScore(qData[qid]),
                });
            });
            var html = Mustache.render(BasicTestInstanceViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return BasicTestInstanceView;
});

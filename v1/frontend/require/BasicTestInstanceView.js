
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
            data.tid = this.model.get("tid");
            data.tiid = this.model.get("tiid");
            data.tiNumber = this.model.get("number");
            data.longName = this.store.tiidLongName(data.tiid);

            var nextDate = this.test.get("nextDate");
            if (nextDate) data.date = this.appModel.formatDate(nextDate);
            var visibleAccess = this.test.get("visibleAccess");
            data.dateTooltip = this.appModel.formatVisibleAccess(visibleAccess);

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
            var uniqueIds = this.model.get("uniqueIds");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                data.questionList.push({
                    qid: qid,
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    tiNumber: that.model.get("number"),
                    title: question.title,
                    number: index + 1,
                    fullNumber: that.model.get("shuffled") ? "#" + hwNumber + "." + uniqueIds[index] : "#" + hwNumber + "." + (index + 1),
                    attempts: BasicTestHelper.renderQAttempts(qData[qid]),
                    score: BasicTestHelper.renderQScore(qData[qid]),
                });
            });
            var html = Mustache.render(BasicTestInstanceViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
            this.$('[data-toggle=popover]').popover();
        },

        close: function() {
            this.remove();
        }
    });

    return BasicTestInstanceView;
});

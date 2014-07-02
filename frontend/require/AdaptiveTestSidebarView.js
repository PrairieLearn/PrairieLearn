
define(["underscore", "backbone", "mustache", "AdaptiveTestHelper", "text!AdaptiveTestSidebarView.html"], function(_, Backbone, Mustache, AdaptiveTestHelper, AdaptiveTestSidebarViewTemplate) {

    var AdaptiveTestSidebarView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
            this.listenTo(this.tInstance, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.title = this.test.get("title");
            var hwNumber = this.test.get("number");
            data.hwNumber = hwNumber;
            data.set = this.test.get("set");
            data.hwScore = AdaptiveTestHelper.renderHWScore(this.tInstance);
            data.tiid = this.tInstance.get("tiid");

            var modelData = this.tInstance.get("modelData");
            data.masteryScore = AdaptiveTestHelper.renderMasteryScore(modelData);
            data.masteryBar = AdaptiveTestHelper.renderMasteryBar(modelData);
            var score = this.tInstance.get("score");
            data.scoreBar = AdaptiveTestHelper.renderScoreBar(score);

            var qid = this.model.get("qid");
            var qids = that.test.get("qids");
            var qIndex = _.indexOf(qids, qid);

            data.qNumber = qIndex + 1;
            data.qFullNumber = "#" + hwNumber + "-" + (qIndex + 1);
            data.prevQNumber = null;
            data.nextQNumber = null;
            if (qIndex > 0)
                data.prevQNumber = qIndex;
            if (qIndex < qids.length - 1)
                data.nextQNumber = qIndex + 2;

            data.recommendBar = AdaptiveTestHelper.renderRecommendBar(modelData, qid);
            data.correctPoints = AdaptiveTestHelper.renderCorrectPoints(modelData, qid);
            data.incorrectPoints = AdaptiveTestHelper.renderIncorrectPoints(modelData, qid);
            data.attempts = AdaptiveTestHelper.renderAttempts(modelData, qid);

            var html = Mustache.render(AdaptiveTestSidebarViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return AdaptiveTestSidebarView;
});

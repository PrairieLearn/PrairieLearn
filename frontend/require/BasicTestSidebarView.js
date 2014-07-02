
define(["underscore", "backbone", "mustache", "BasicTestHelper", "text!BasicTestSidebarView.html"], function(_, Backbone, Mustache, BasicTestHelper, BasicTestSidebarViewTemplate) {

    var BasicTestSidebarView = Backbone.View.extend({

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
            data.tiid = this.tInstance.get("tiid");

            var score = this.tInstance.get("score");
            data.score = BasicTestHelper.renderHWScore(score);
            data.scoreBar = BasicTestHelper.renderScoreBar(score);

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
            var qData = this.tInstance.get("qData");
            data.qAttempts = BasicTestHelper.renderQAttempts(qData[qid]);
            data.qScore = BasicTestHelper.renderQScore(qData[qid]);

            var html = Mustache.render(BasicTestSidebarViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return BasicTestSidebarView;
});

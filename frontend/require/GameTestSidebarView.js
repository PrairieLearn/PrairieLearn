
define(["underscore", "backbone", "mustache", "GameTestHelper", "text!GameTestSidebarView.html"], function(_, Backbone, Mustache, GameTestHelper, GameTestSidebarViewTemplate) {

    var GameTestSidebarView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "show.bs.modal": "loadVideo",
            "hide.bs.modal": "unloadVideo"
        },

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.store = this.options.store;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
            this.listenTo(this.tInstance, "change", this.render);
        },

        loadVideo: function() {
            var $player = $('#player');
            $player.attr('src', $player.data('url'));
        },

        unloadVideo: function() {
            $('#player').attr('src', '');
        },

        render: function() {
            var that = this;
            var testOptions = this.test.get("options");

            var data = {};
            data.hwScore = GameTestHelper.renderHWScore(this.tInstance, this.test, testOptions);
            data.scoreBar = GameTestHelper.renderHWScoreBar(this.tInstance, this.test, testOptions);
            data.tiid = this.tInstance.get("tiid");
            data.testShortName = this.store.tiidShortName(data.tiid);

            var qid = this.model.get("qid");
            var qids = that.test.get("qids");
            var qIndex = _.indexOf(qids, qid);

            data.qNumber = qIndex + 1;
            var hwNumber = this.test.get("number");
            data.qFullNumber = "#" + hwNumber + "-" + (qIndex + 1);
            data.prevQNumber = null;
            data.nextQNumber = null;
            if (qIndex > 0)
                data.prevQNumber = qIndex;
            if (qIndex < qids.length - 1)
                data.nextQNumber = qIndex + 2;

            data.video = this.model.get("video");

            var qData = this.tInstance.get("qData");
            var qParams = this.test.get("qParams");
            data.value = GameTestHelper.renderQuestionValue(qData[qid].value, qParams[qid].initValue);
            data.score = GameTestHelper.renderQuestionScore(qData[qid].score, qParams[qid].maxScore);

            var html = Mustache.render(GameTestSidebarViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return GameTestSidebarView;
});

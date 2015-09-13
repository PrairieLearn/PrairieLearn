
define(["underscore", "backbone", "mustache", "AdaptiveTestHelper", "text!AdaptiveTestView.html"], function(_, Backbone, Mustache, AdaptiveTestHelper, AdaptiveTestViewTemplate) {

    var AdaptiveTestView = Backbone.View.extend({
        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.tInstances = this.options.tInstances;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.tInstances, "change", this.render);
        },

        render: function() {
            var that = this;
            var testOptions = this.model.get("options");

            var data = {};
            data.set = this.model.get("set");
            data.number = this.model.get("number");
            data.title = this.model.get("title");
            data.tid = this.model.get("tid");

            var tInstance = this.tInstances.findWhere({tid: this.model.get("tid")});
            if (tInstance === undefined)
                return;
            data.tiid = tInstance.get("tiid");
            var score = tInstance.get("score");
            data.score = AdaptiveTestHelper.renderHWScore(tInstance, testOptions);
            data.scoreBar = AdaptiveTestHelper.renderScoreBar(score);
            var dueDate = new Date(that.model.get("dueDate"));
            data.dueDate = AdaptiveTestHelper.renderDueDate(dueDate);
            var availDate = new Date(that.model.get("availDate"));
            data.availDate = AdaptiveTestHelper.renderAvailDate(availDate);
            data.seeAvailDate = this.appModel.hasPermission("seeAvailDate");
            data.seeDetail = this.appModel.hasPermission("viewOtherUsers");

            var html = Mustache.render(AdaptiveTestViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },
    });

    return AdaptiveTestView;
});

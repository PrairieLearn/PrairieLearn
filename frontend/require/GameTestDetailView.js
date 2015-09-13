
define(["underscore", "backbone", "mustache", "PrairieTemplate", "GameTestHelper", "text!GameTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, GameTestHelper, GameTestDetailViewTemplate) {

    var GameTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(GameTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return GameTestDetailView;
});

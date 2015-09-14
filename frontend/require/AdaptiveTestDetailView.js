
define(["underscore", "backbone", "mustache", "PrairieTemplate", "AdaptiveTestHelper", "text!AdaptiveTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, AdaptiveTestHelper, AdaptiveTestDetailViewTemplate) {

    var AdaptiveTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(AdaptiveTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return AdaptiveTestDetailView;
});

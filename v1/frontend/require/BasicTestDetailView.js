
define(["underscore", "backbone", "mustache", "PrairieTemplate", "BasicTestHelper", "text!BasicTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, BasicTestHelper, BasicTestDetailViewTemplate) {

    var BasicTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(BasicTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return BasicTestDetailView;
});

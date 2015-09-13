
define(["underscore", "backbone", "mustache", "PrairieTemplate", "RetryExamTestHelper", "text!RetryExamTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, RetryExamTestHelper, RetryExamTestDetailViewTemplate) {

    var RetryExamTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(RetryExamTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return RetryExamTestDetailView;
});

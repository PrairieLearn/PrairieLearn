
define(["underscore", "backbone", "mustache", "PrairieTemplate", "ExamTestHelper", "text!ExamTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, ExamTestHelper, ExamTestDetailViewTemplate) {

    var ExamTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(ExamTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return ExamTestDetailView;
});

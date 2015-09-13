
define(["underscore", "backbone", "mustache", "PrairieTemplate", "PracExamTestHelper", "text!PracExamTestDetailView.html"], function(_, Backbone, Mustache, PrairieTemplate, PracExamTestHelper, PracExamTestDetailViewTemplate) {

    var PracExamTestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(PracExamTestDetailViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return PracExamTestDetailView;
});

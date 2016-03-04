
define(['underscore', 'backbone', 'mustache', 'renderer', 'spinController', 'text!QuestionSubmissionsView.html'], function(_, Backbone, Mustache, renderer, spinController, questionSubmissionsViewTemplate) {

    var QuestionSubmissionsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change:qClient change:pastSubmissions change:showSubmissions", this.render);
            this.render();
        },

        render: function() {
            var data = {
                showSubmissions: this.model.get("showSubmissions"),
            };
            var html = Mustache.render(questionSubmissionsViewTemplate, data);
            this.$el.html(html);
            var qClient = this.model.get("qClient");
			// More to come here
        },

        close: function() {
            this.remove();
        },
    });

    return {
        QuestionSubmissionsView: QuestionSubmissionsView
    };
});

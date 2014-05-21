
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!QuestionScoreView.html'], function(_, Backbone, Mustache, renderer, questionScoreViewTemplate) {

    var QuestionScoreView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            data = {
                attempts: renderer.attemptsLabel(this.model.get("n")),
                avgScore: renderer.scoreLabel(this.model.get("avgScore")),
                maxScore: renderer.scoreLabel(this.model.get("maxScore"))
            };
            var html = Mustache.render(questionScoreViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionScoreView: QuestionScoreView
    };
});

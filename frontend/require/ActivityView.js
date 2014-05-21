
define(['underscore', 'backbone', 'mustache', 'text!ActivityView.html'], function(_, Backbone, Mustache, activityViewTemplate) {

    var ActivityView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var submissions = this.model.get("submissions");
            var items = [];
            _.each(submissions, function(submission) {
                submission.scoreText = (submission.score == null) ? "no score" : ((submission.score * 100).toFixed(0) + "%");
            });
            var data = {
                submissions: submissions
            };
            var html = Mustache.render(activityViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        ActivityView: ActivityView
    };
});

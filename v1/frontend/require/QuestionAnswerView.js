
define(['underscore', 'backbone', 'mustache', 'renderer', 'spinController', 'text!QuestionAnswerView.html'], function(_, Backbone, Mustache, renderer, spinController, questionAnswerViewTemplate) {

    var QuestionAnswerView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.questionDataModel = this.options.model;
            this.appModel = this.options.appModel;
            this.listenTo(this.model, "change:qClient change:showAnswer", this.render);
            this.render();
        },

        render: function() {
            var data = {
                showAnswer: this.model.get("showAnswer"),
            };
            var html = Mustache.render(questionAnswerViewTemplate, data);
            this.$el.html(html);
            var qClient = this.model.get("qClient");
            if (qClient && data.showAnswer) {
                qClient.renderAnswer("#qanswerBody", this.questionDataModel, this.appModel);
            }
        },

        close: function() {
            this.remove();
        },
    });

    return {
        QuestionAnswerView: QuestionAnswerView
    };
});

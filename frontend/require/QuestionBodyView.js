
define(['underscore', 'backbone', 'mustache', 'spinController', 'TestFactory', 'text!QuestionBodyView.html'], function(_, Backbone, Mustache, spinController, TestFactory, questionBodyViewTemplate) {

    var QuestionBodyView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change:qClient", this.render);
            this.render();
        },

        render: function() {
            var that = this;
            var qid = this.model.get("qid");

            var testClient = TestFactory.getClass(this.test.get("type"), "client");
            var qTitle = this.model.get("title");
            var qNumber = testClient.formatQNumber(qid, this.test, this.tInstance);
            var title;
            if (this.model.get("showTitle")) {
                title = qNumber + ": " + qTitle;
            } else {
                title = "Question " + qNumber;
            }
            if (this.model.appModel.hasPermission("seeQID"))
                title += " (" + this.model.get("qid") + ")";
            var data = {
                title: title,
            };
            var html = Mustache.render(questionBodyViewTemplate, data);
            this.$el.html(html);

            var qClient = this.model.get("qClient");
            if (qClient == null) {
                if (!this.spinner) {
                    var el = document.getElementById("qbody-spinner");
                    this.spinner = spinController.startSpinner(el);
                }
                return;
            }
            if (this.spinner) {
                spinController.stopSpinner(this.spinner);
            }
            qClient.renderQuestion("#qInnerBody", function() {
                that.model.set("submittable", qClient.isComplete());
                that.model.trigger("answerChanged");
            }, this.model, this.appModel);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionBodyView: QuestionBodyView
    };
});

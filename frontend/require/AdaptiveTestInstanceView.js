
define(["underscore", "backbone", "mustache", "PrairieTemplate", "AdaptiveTestHelper", "text!AdaptiveTestInstanceView.html"], function(_, Backbone, Mustache, PrairieTemplate, AdaptiveTestHelper, AdaptiveTestInstanceViewTemplate) {

    var AdaptiveTestInstanceView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.store = this.options.store;
            this.appModel = this.options.appModel;
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var testOptions = this.test.get("options");

            var data = {};
            data.tiid = this.model.get("tiid");
            data.longName = this.store.tiidLongName(data.tiid);

            var modelData = this.model.get("modelData");
            data.masteryScore = AdaptiveTestHelper.renderMasteryScore(modelData);
            data.masteryBar = AdaptiveTestHelper.renderMasteryBar(modelData);
            data.hwScore = AdaptiveTestHelper.renderHWScore(this.model, testOptions);
            var score = this.model.get("score");
            data.scoreBar = AdaptiveTestHelper.renderScoreBar(score);

            var dueDate = new Date(this.test.get("dueDate"));
            var options = {hour: "numeric", minute: "numeric"};
            var dateString = dueDate.toLocaleTimeString("en-US", options);
            options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
            dateString += ", " + dueDate.toLocaleDateString("en-US", options);;
            var tooltip = "Due at " + dueDate.toString();
            data.dueDate = '<span '
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            data.dueDate += 'Due&nbsp;Date: ';
            data.dueDate += '<strong>';
            data.dueDate += dateString;
            data.dueDate += '</strong>';
            data.dueDate += '</span>';

            var text = this.test.get("text");
            if (text) {
                data.text = PrairieTemplate.template(text, {}, undefined, this.appModel, this.model);
            }

            data.questionList = [];
            var qids = that.test.get("qids");
            var qDists = that.test.get("qDists");
            var userDist = that.model.get("dist");
            var hwNumber = this.test.get("number");
            var questions = this.model.get("questions");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                data.questionList.push({
                    qid: qid,
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: question.title,
                    number: index + 1,
                    fullNumber: "#" + hwNumber + "." + (index + 1),
                    recommendBar: AdaptiveTestHelper.renderRecommendBar(modelData, qid),
                    correctPoints: AdaptiveTestHelper.renderCorrectPoints(modelData, qid),
                    incorrectPoints: AdaptiveTestHelper.renderIncorrectPoints(modelData, qid),
                    attempts: AdaptiveTestHelper.renderAttempts(modelData, qid)
                });
            });
            var html = Mustache.render(AdaptiveTestInstanceViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return AdaptiveTestInstanceView;
});

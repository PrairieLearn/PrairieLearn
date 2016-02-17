
define(["underscore", "backbone", "mustache", "PrairieTemplate", "GameTestHelper", "text!GameTestInstanceView.html"], function(_, Backbone, Mustache, PrairieTemplate, GameTestHelper, GameTestInstanceViewTemplate) {

    var GameTestInstanceView = Backbone.View.extend({

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
            data.tid = this.model.get("tid");
            data.tiid = this.model.get("tiid");
            data.tiNumber = this.model.get("number");
            data.longName = this.store.tiidLongName(data.tiid);

            var modelData = this.model.get("modelData");
            data.hwScore = GameTestHelper.renderHWScore(this.model, this.test, testOptions);
            data.scoreBar = GameTestHelper.renderHWScoreBar(this.model, this.test, testOptions);

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
            var qData = this.model.get("qData");
            var qParams = this.test.get("qParams");
            var qids = that.test.get("qids");
            var hwNumber = this.test.get("number");
            var questions = this.model.get("questions");
            _(questions).each(function(question, index) {
                var qid = question.qid;
                data.questionList.push({
                    qid: qid,
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    tiNumber: that.model.get("number"),
                    title: question.title,
                    number: index + 1,
                    fullNumber: "#" + hwNumber + "." + (index + 1),
                    value: GameTestHelper.renderQuestionValue(qData[qid].value, qParams[qid].initValue),
                    score: GameTestHelper.renderQuestionScore(qData[qid].score, qParams[qid].maxScore),
                });
            });
            var html = Mustache.render(GameTestInstanceViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return GameTestInstanceView;
});

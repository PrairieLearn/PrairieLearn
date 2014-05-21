
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!QuestionsView.html'], function(_, Backbone, Mustache, renderer, questionsViewTemplate) {

    var QuestionsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.questions = this.options.questions;
            this.qScores = this.options.qScores;
            this.listenTo(this.questions, "add", this.render);
            this.listenTo(this.qScores, "add", this.render);
        },

        render: function() {
            var scoresByQID = {};
            this.qScores.each(function(qs) {
                scoresByQID[qs.get("qid")] = qs;
            });
            var items = [], item;
            var scoreText, qScore;
            var attemptsCounts = renderer.zeroCounts();
            var avgScoreCounts = renderer.zeroCounts();
            this.questions.each(function(q) {
                item = {
                    qid: q.get("qid"),
                    title: q.get("title"),
                    number: q.get("number")
                };
                qScore = scoresByQID[q.get("qid")];
                if (qScore != null) {
                    item.attempts = renderer.attemptsLabel(qScore.get("n"), attemptsCounts);
                    item.avgScore = renderer.scoreLabel(qScore.get("avgScore"), avgScoreCounts);
                    item.bestScore = renderer.scoreLabel(qScore.get("maxScore"));
                }
                else {
                    item.attempts = renderer.attemptsLabel(0, attemptsCounts);
                    renderer.scoreLabel(0, avgScoreCounts);
                    item.avgScore = '';
                    item.bestScore = '';
                }
                items.push(item);
            });
            var data = {
                attemptsProgressBar: renderer.countsProgressBar(attemptsCounts, 'question', renderer.attemptsToolTipTexts, "auto top", true, false),
                avgScoreProgressBar: renderer.countsProgressBar(avgScoreCounts, 'question', renderer.avgScoreToolTipTexts, "auto top", true, false),
                questionList: items
            };
            var html = Mustache.render(questionsViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionsView: QuestionsView
    };
});

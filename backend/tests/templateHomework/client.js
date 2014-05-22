
define(["jquery", "underscore", "backbone", "Mustache", "rivets", "PrairieTemplate", "PrairieQueue", "PrairieRandom", "PrairieModel", "renderer"], function($, _, Backbone, Mustache, rivets, PrairieTemplate, PrairieQueue, PrairieRandom, PrairieModel, renderer) {

    var renderHWScore = function(score) {
        var perc = Math.round(score * 100);
        var html;
        var tooltip = 'Your average score on all questions for this homework is ' + perc + '%.';
        html = '<span '
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += 'Score: ';
        html += '<strong>' + perc + '%' + '</strong>';
        html += '</span>';
        return html;
    };

    var renderScoreBar = function(score) {
        var perc = Math.round(score * 100);
        var html;
        var tooltip = 'Your average score on all questions for this homework is ' + perc + '%.';
        html = '<div class="progress"'
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += '<div class="progress-bar progress-bar-success" style="width: ' + perc + '%"></div>';
        html += '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - perc) + '%"></div>';
        html += '</div>';
        return html;
    };

    var renderQAttempts = function(data) {
        var html;
        var n = data ? data.nAttempt : 0;
        var tooltip = "You have attempted this question " + n + " " + ((n === 1) ? "time" : "times") + " in this homework.";
        var extraAtts = 'data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"';
        html = renderer.attemptsLabel(n, undefined, undefined, extraAtts);
        return html;
    };

    var renderQScore = function(data) {
        var html;
        var score = data ? data.avgScore : 0;
        var tooltip = "Your average score on all attempts for this question is " + (score * 100).toFixed(0) + '%.';
        var extraAtts = 'data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"';
        html = renderer.scoreLabel(score, undefined, extraAtts);
        return html;
    };

    var TestView = Backbone.View.extend({
        tagName: 'div',

        initialize: function() {
            this.tInstances = this.options.tInstances;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.tInstances, "change", this.render);
        },

        render: function() {
            var that = this;
            var template = this.model.get("templateOverview");
            if (template === undefined)
                return;
            var data = {};
            data.title = this.model.get("title");
            data.tid = this.model.get("tid");

            this.tInstances.each(function(tInstance, index) {
                if (tInstance.get("tid") !== that.model.get("tid"))
                    return;
                data.score = tInstance.score;
            });

            var html = Mustache.render(template, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },
    });

    var TestInstanceView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        render: function() {
            var that = this;
            var template = this.test.get("template");
            if (template === undefined)
                return;
            var data = {};
            data.title = this.test.get("title");
            var hwNumber = this.test.get("number");
            data.number = hwNumber;
            data.tiid = this.model.get("tiid");

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

            var score = this.model.get("score");
            data.score = renderHWScore(score);
            data.scoreBar = renderScoreBar(score);

            data.questionList = [];
            var qids = this.test.get("qids");
            var qData = this.model.get("qData");
            _(qids).each(function(qid, index) {
                var q = that.questions.get(qid);
                data.questionList.push({
                    qid: q.get("qid"),
                    tid: that.model.get("tid"),
                    tiid: that.model.get("tiid"),
                    title: q.get("title"),
                    number: index + 1,
                    fullNumber: "#" + hwNumber + "-" + (index + 1),
                    attempts: renderQAttempts(qData[qid]),
                    score: renderQScore(qData[qid]),
                });
            });
            var html = Mustache.render(template, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    var TestInstanceSidebarView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
            this.listenTo(this.tInstance, "change", this.render);
        },

        render: function() {
            var that = this;
            var template = this.test.get("templateSidebar");
            if (template === undefined)
                return;
            var data = {};
            data.title = this.test.get("title");
            var hwNumber = this.test.get("number");
            data.hwNumber = hwNumber;
            data.tiid = this.tInstance.get("tiid");

            var score = this.tInstance.get("score");
            data.score = renderHWScore(score);
            data.scoreBar = renderScoreBar(score);

            var qid = this.model.get("qid");
            var qids = that.test.get("qids");
            var qIndex = _.indexOf(qids, qid);

            data.qNumber = qIndex + 1;
            data.qFullNumber = "#" + hwNumber + "-" + (qIndex + 1);
            data.prevQNumber = null;
            data.nextQNumber = null;
            if (qIndex > 0)
                data.prevQNumber = qIndex;
            if (qIndex < qids.length - 1)
                data.nextQNumber = qIndex + 2;
            var qData = this.tInstance.get("qData");
            data.qAttempts = renderQAttempts(qData[qid]);
            data.qScore = renderQScore(qData[qid]);

            var html = Mustache.render(template, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    var TestHelper = function() {
    };

    TestHelper.prototype.formatQNumber = function(qid, test, tInstance) {
        var hwNumber = test.get("number");
        var qids = test.get("qids");
        var qIndex = _(qids).indexOf(qid);
        return "#" + hwNumber + "-" + (qIndex + 1);
    };

    return {
        TestInstanceView: TestInstanceView,
        TestInstanceSidebarView: TestInstanceSidebarView,
        TestHelper: TestHelper
    };
});

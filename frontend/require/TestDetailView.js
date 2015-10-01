
define(['underscore', 'backbone', 'mustache', 'renderer', 'TestFactory', 'text!TestDetailView.html'], function(_, Backbone, Mustache, renderer, TestFactory, TestDetailViewTemplate) {

    var TestDetailView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .resetTest": "resetTest",
            "click .resetTestForAll": "resetTestForAll",
            "click .finishTestForAll": "finishTestForAll",
            "click .reloadStats": "reloadStats",
        },

        initialize: function() {
            var that = this;
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            var TestStats = Backbone.Model.extend({
                url: function() {return that.appModel.apiURL("testStats/" + that.model.get("tid"));},
             });
            this.testStats = new TestStats;
            this.listenTo(this.model, "all", this.render);
            this.listenTo(this.testStats, "all", this.render);
            this.testStats.fetch();
        },

        render: function() {
            var options = this.model.get("options");
            var data = {};
            data.tid = this.model.get("tid");
            data.title = this.model.get("set") + " " + this.model.get("number") + ": " + this.model.get("title");
            data.userUID = this.appModel.get("userUID");
            data.seeReset = this.appModel.hasPermission("deleteTInstances");
            data.seeFinish = this.appModel.hasPermission("editOtherUsers") && options && options.allowFinish;

            data.seeDownload = this.appModel.hasPermission("viewOtherUsers");
            data.testScoresFilename = this.model.get("tid") + "_scores.csv";
            data.testScoresLink = this.appModel.apiURL("testScores/" + data.testScoresFilename + "?tid=" + data.tid);
            data.testScoresCompassFilename = this.model.get("tid") + "_scores_compass.csv";
            data.testScoresCompassLink = this.appModel.apiURL("testScores/" + data.testScoresFilename + "?tid=" + data.tid + "&format=compass");
            data.testFinalSubmissionsFilename = this.model.get("tid") + "_final_submissions.csv";
            data.testFinalSubmissionsLink = this.appModel.apiURL("testFinalSubmissions/" + data.testFinalSubmissionsFilename + "?tid=" + data.tid);
            data.testAllSubmissionsFilename = this.model.get("tid") + "_all_submissions.csv";
            data.testAllSubmissionsLink = this.appModel.apiURL("testAllSubmissions/" + data.testAllSubmissionsFilename + "?tid=" + data.tid);
            data.testFilesZipFilename = this.model.get("tid") + "_files.zip";
            data.testFilesZipLink = this.appModel.apiURL("testFilesZip/" + data.testFilesZipFilename + "?tid=" + data.tid);

            data.seeTestStats = this.appModel.hasPermission("viewOtherUsers");
            data.hasTestStats = this.testStats.has("n");
            if (data.hasTestStats) {
                data.n = this.testStats.get("n");
                data.scores = this.testStats.get("scores");
                data.mean = (this.testStats.get("mean") * 100).toFixed(1);
                data.median = (this.testStats.get("median") * 100).toFixed(1);
                data.stddev = (this.testStats.get("stddev") * 100).toFixed(1);
            }
            
            var html = Mustache.render(TestDetailViewTemplate, data);
            this.$el.html(html);

            if (data.hasTestStats) {
                this.renderScoreHistogram("#scoreHistogramPlot", data.scores, "score / %", "number of students");
            }
            
            var TestDetailView = TestFactory.getClass(this.model.get("type"), "tDetailView");
            if (!TestDetailView)
                return;
            this.subView = new TestDetailView({model: this.model, appModel: this.appModel, test: this.test, questions: this.questions});
            this.listenTo(this.subView, "resetTest", this.resetTest.bind(this));
            this.listenTo(this.subView, "resetTestForAll", this.resetTestForAll.bind(this));
            this.subView.render();
            this.$("#tDetail").html(this.subView.el);
        },

        renderScoreHistogram: function(selector, scores, xlabel, ylabel) {
            var values = scores.map(function(i) {return i * 100});
            
            var formatCount = d3.format(",.0f");

            var margin = {top: 40, right: 20, bottom: 50, left: 70},
                width = 500 - margin.left - margin.right,
                height = 300 - margin.top - margin.bottom;

            var x = d3.scale.linear()
                .domain([0, 100])
                .range([0, width]);

            var data = d3.layout.histogram()
                .range([0, 100])
                .bins(20)
                (values);

            var y = d3.scale.linear()
                .domain([0, d3.max(data, function(d) { return d.y; })])
                .range([height, 0]);

            var xAxis = d3.svg.axis()
                .scale(x)
                .orient("bottom");

            var yAxis = d3.svg.axis()
                .scale(y)
                .ticks(5)
                .orient("left");
            
            var svg = d3.select(this.$(selector).get(0)).append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .attr("class", "center-block")
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            var bar = svg.selectAll("bar")
                .data(data)
                .enter()
                .append("g")
                .attr("class", "bar")
                .attr("transform", function(d) { return "translate(" + x(d.x) + "," + y(d.y) + ")"; });

            bar.append("rect")
                .attr("x", 1)
                .attr("width", x(data[0].dx) - 1)
                .attr("height", function(d) { return height - y(d.y); })
                .attr("fill", "steelblue")
                .attr("shape-rendering", "crispEdges");

            bar.append("text")
                .attr("dy", "-0.75em")
                .attr("y", 6)
                .attr("x", x(data[0].dx) / 2)
                .attr("text-anchor", "middle")
                .text(function(d) { return formatCount(d.y); });
            
            svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + height + ")")
                .call(xAxis)
                .append("text")
                .attr("class", "label")
                .attr("x", width / 2)
                .attr("y", "2.5em")
                .style("text-anchor", "middle")
                .text(xlabel);

            svg.append("g")
                .attr("class", "y axis")
                .call(yAxis)
                .append("text")
                .attr("class", "label")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", "-3em")
                .style("text-anchor", "middle")
                .text(ylabel);
        },

        _resetSuccess: function(data, textStatus, jqXHR) {
            this.$("#actionResult").html('<div class="alert alert-success" role="alert">Successfully reset test.</div>');
            Backbone.trigger('reloadUserData');
        },
        
        _resetError: function(jqXHR, textStatus, errorThrown) {
            this.$("#actionResult").html('<div class="alert alert-danger" role="alert">Error resetting test.</div>');
            Backbone.trigger('reloadUserData');
        },
        
        resetTest: function() {
            this.$("#actionResult").html('');
            var that = this;
            this.$('#confirmResetTestModal').on('hidden.bs.modal', function (e) {
                var tid = that.model.get("tid");
                var userUID = that.appModel.get("userUID");
                $.ajax({
                    dataType: "json",
                    url: that.appModel.apiURL("tInstances?tid=" + tid + "&uid=" + userUID),
                    type: "DELETE",
                    processData: false,
                    contentType: 'application/json; charset=UTF-8',
                    success: that._resetSuccess.bind(that),
                    error: that._resetError.bind(that),
                });
            });
            this.$("#confirmResetTestModal").modal('hide');
        },

        resetTestForAll: function() {
            this.$("#actionResult").html('');
            var that = this;
            this.$('#confirmResetTestForAllModal').on('hidden.bs.modal', function (e) {
                var tid = that.model.get("tid");
                $.ajax({
                    dataType: "json",
                    url: that.appModel.apiURL("tInstances?tid=" + tid),
                    type: "DELETE",
                    processData: false,
                    contentType: 'application/json; charset=UTF-8',
                    success: that._resetSuccess.bind(that),
                    error: that._resetError.bind(that),
                });
            });
            this.$("#confirmResetTestForAllModal").modal('hide');
        },

        _finishSuccess: function(data, textStatus, jqXHR) {
            if (data.tiidsClosed.length == 0) {
                this.$("#actionResult").html('<div class="alert alert-success" role="alert">All tests were already finished.</div>');
            } else {
                this.$("#actionResult").html('<div class="alert alert-success" role="alert">Successfully finished all open tests. Number of tests finished: ' + data.tiidsClosed.length + '</div>');
            }
            Backbone.trigger('reloadUserData');
        },
        
        _finishError: function(jqXHR, textStatus, errorThrown) {
            this.$("#actionResult").html('<div class="alert alert-danger" role="alert">Error finishing tests.</div>');
            Backbone.trigger('reloadUserData');
        },
        
        finishTestForAll: function() {
            this.$("#actionResult").html('');
            var that = this;
            this.$('#confirmFinishTestForAllModal').on('hidden.bs.modal', function (e) {
                var tid = that.model.get("tid");
                var finish = {tid: tid};
                $.ajax({
                    dataType: "json",
                    url: that.appModel.apiURL("finishes"),
                    type: "POST",
                    processData: false,
                    data: JSON.stringify(finish),
                    contentType: 'application/json; charset=UTF-8',
                    success: that._finishSuccess.bind(that),
                    error: that._finishError.bind(that),
                });
            });
            this.$("#confirmFinishTestForAllModal").modal('hide');
        },

        reloadStats: function() {
            this.testStats.clear();
            this.testStats.fetch();
        },

        close: function() {
            if (this.subView) {
                this.subView.close();
            }
            this.remove();
        }
    });

    return TestDetailView;
});

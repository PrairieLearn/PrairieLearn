
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
            var that = this;
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
            data.testFilesStatsFilename = this.model.get("tid") + "_stats.csv";
            data.testFilesStatsLink = this.appModel.apiURL("testStatsCSV/" + data.testFilesStatsFilename + "?tid=" + data.tid);
            data.testFilesQStatsFilename = this.model.get("tid") + "_question_stats.csv";
            data.testFilesQStatsLink = this.appModel.apiURL("testQStatsCSV/" + data.testFilesQStatsFilename + "?tid=" + data.tid);
            if (data.hasTestStats) {
                data.n = this.testStats.get("n");
                data.scores = this.testStats.get("scores");
                data.mean = (this.testStats.get("mean") * 100).toFixed(1);
                data.median = (this.testStats.get("median") * 100).toFixed(1);
                data.stddev = (this.testStats.get("stddev") * 100).toFixed(1);
                data.min = (this.testStats.get("min") * 100).toFixed(1);
                data.max = (this.testStats.get("max") * 100).toFixed(1);
                data.nZeroScore = this.testStats.get("nZeroScore");
                data.nFullScore = this.testStats.get("nFullScore");
                data.fracZeroScore = (data.n > 0) ? (data.nZeroScore / data.n * 100).toFixed(1) : 0;
                data.fracFullScore = (data.n > 0) ? (data.nFullScore / data.n * 100).toFixed(1) : 0;
                var byQID = this.testStats.get("byQID");
                data.qStats = [];

                var pbar = function(val) {
                    val = Math.round(val);
                    if (val >= 50) {
                        return '<div class="progress" style="width: 7em">'
                            + '<div class="progress-bar progress-bar-success" style="width: ' + val + '%">' + val + '%</div>'
                            + '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - val) + '%"></div>'
                            + '</div>';
                    } else {
                        return '<div class="progress" style="width: 7em">'
                            + '<div class="progress-bar progress-bar-success" style="width: ' + val + '%"></div>'
                            + '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - val) + '%">' + val + '%</div>'
                            + '</div>';
                    }
                };
                
                var pbar2 = function(val) {
                    val = Math.round(val);
                    if (val >= 50) {
                        return '<div class="progress" style="width: 7em">'
                            + '<div class="progress-bar progress-bar-primary" style="width: ' + val + '%">' + val + '%</div>'
                            + '<div class="progress-bar progress-bar-warning" style="width: ' + (100 - val) + '%"></div>'
                            + '</div>';
                    } else {
                        return '<div class="progress" style="width: 7em">'
                            + '<div class="progress-bar progress-bar-primary" style="width: ' + val + '%"></div>'
                            + '<div class="progress-bar progress-bar-warning" style="width: ' + (100 - val) + '%">' + val + '%</div>'
                            + '</div>';
                    }
                };
                
                _(byQID).each(function(stat, qid) {
                    var meanScoreByQuintile = _(stat.meanScoreByQuintile).map(function(s) {return s * 100;});
                    var meanScoreByQuintileStrings = _(meanScoreByQuintile).map(function(s) {return s.toFixed(1);});
                    data.qStats.push({
                        qid: qid,
                        title: that.questions.get(qid).get("title"),
                        n: stat.n,
                        meanScore: stat.meanScore * 100,
                        meanScoreString: (stat.meanScore * 100).toFixed(0),
                        meanScoreBar: pbar(stat.meanScore * 100),
                        meanNAttempts: stat.meanNAttempts,
                        meanNAttemptsString: stat.meanNAttempts.toFixed(1),
                        fracEverCorrect: stat.fracEverCorrect * 100,
                        fracEverCorrectString: (stat.fracEverCorrect * 100).toFixed(0),
                        fracEverCorrectBar: pbar(stat.fracEverCorrect * 100),
                        discrimination: stat.discrimination * 100,
                        discriminationString: (stat.discrimination * 100).toFixed(0),
                        discriminationBar: pbar2(stat.discrimination * 100),
                        meanScoreByQuintile: meanScoreByQuintile,
                        meanScoreByQuintileStrings: meanScoreByQuintileStrings,
                        meanScoreByQuintileString: _(meanScoreByQuintileStrings).map(function(s) {return s + '%';}).join(', '),
                    });
                });
                data.qStats = _(data.qStats).sortBy('qid');
                _(data.qStats).each(function(stat, i) {
                    stat.number = i + 1;
                });
            }
            
            var html = Mustache.render(TestDetailViewTemplate, data);
            this.$el.html(html);

            if (data.hasTestStats) {
                this.renderScoreHistogram("#scoreHistogramPlot", data.scores, "score / %", "number of students");
                this.renderQuestionScoreDiscPlot("#questionScoreDiscPlot", data.qStats);
                _(data.qStats).each(function(stat) {
                    that.renderScoresByQuintilePlot("#scoresByQuintile" + stat.qid, stat.meanScoreByQuintile);
                });
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
        },

        renderQuestionScoreDiscPlot: function(selector, qStats) {
            var margin = {top: 10, right: 20, bottom: 50, left: 70},
            width = 400 - margin.left - margin.right,
            height = 400 - margin.top - margin.bottom;

            var x = d3.scale.linear()
                .range([0, width]);

            var y = d3.scale.linear()
                .range([height, 0]);

            var color = d3.scale.category10();

            var xAxis = d3.svg.axis()
                .scale(x)
                .orient("bottom");

            var yAxis = d3.svg.axis()
                .scale(y)
                .orient("left");

            var xGrid = d3.svg.axis()
                .scale(x)
                .orient("bottom")
                .tickSize(-height)
                .tickFormat("");

            var yGrid = d3.svg.axis()
                .scale(y)
                .orient("left")
                .tickSize(-width)
                .tickFormat("");

            var svg = d3.select(this.$(selector).get(0)).append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .attr("class", "center-block statsPlot")
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            var xData = _(qStats).map(function(stat) {return stat.meanScore;});
            var yData = _(qStats).map(function(stat) {return stat.discrimination;});
            
            var xExtent = [0, 100]; //d3.extent(xData);
            var yExtent = [0, 100]; //d3.extent(yData);
            var xRange = xExtent[1] - xExtent[0];
            var yRange = yExtent[1] - yExtent[0];
            //xExtent = [xExtent[0] - 0.05 * xRange, xExtent[1] + 0.05 * xRange];
            //yExtent = [yExtent[0], yExtent[1] + 0.05 * yRange];
            x.domain(xExtent);
            y.domain(yExtent);

            svg.append("g")
                .attr("class", "x grid")
                .attr("transform", "translate(0," + height + ")")
                .call(xGrid);

            svg.append("g")
                .attr("class", "y grid")
                .call(yGrid);

            svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + height + ")")
                .call(xAxis)
                .append("text")
                .attr("class", "label")
                .attr("x", width / 2)
                .attr("y", "3em")
                .style("text-anchor", "middle")
                .text("mean score / %");

            svg.append("g")
                .attr("class", "y axis")
                .call(yAxis)
                .append("text")
                .attr("class", "label")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", "-3em")
                .style("text-anchor", "middle")
                .text("discrimination / %");

            /*
            svg.append("g")
                .append("text")
                .attr("class", "label")
                .attr("x", width / 2)
                .attr("y", "-1em")
                .style("text-anchor", "middle")
                .text("Question discrimination versus mean score");
            */

            svg.append("line")
                .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

            svg.append("line")
                .attr({x1: width, y1: 0, x2: width, y2: height, "class": "y axis"});

            svg.selectAll(".point")
                .data(qStats)
                .enter().append("circle")
                .attr("class", "point")
                .attr("cx", function(stat) {return x(stat.meanScore);})
                .attr("cy", function(stat) {return y(stat.discrimination);})
                .attr("r", function(stat) {return 2;});

            svg.selectAll(".pointLabel")
                .data(qStats)
                .enter().append("text")
                .attr("class", "pointLabel")
                .style("text-anchor", "middle")
                .attr("x", function(stat) {return x(stat.meanScore);})
                .attr("y", function(stat) {return y(stat.discrimination) - 6;})
                .text(function(stat) {return stat.number;});
        },

        renderScoresByQuintilePlot: function(selector, hist) {
            var margin = {top: 1, right: 1, bottom: 1, left: 1},
            width = 100 - margin.left - margin.right,
                height = 40 - margin.top - margin.bottom;

            var x = d3.scale.ordinal()
                .domain(d3.range(hist.length))
                .rangeRoundBands([0, width], 0.2);

            var y = d3.scale.linear()
                .domain([0, 100])
                .range([height, 0]);

            var color = d3.scale.category10();

            var svg = d3.select(this.$(selector).get(0)).append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .attr("class", "center-block")
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            svg.append("line")
                .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

            svg.append("line")
                .attr({x1: 0, y1: height, x2: width, y2: height, "class": "x axis"})

            svg.selectAll(".bar")
                .data(hist)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", function(d, i) {return x(i);})
                .attr("y", function(d, i) {return y(d);})
                .attr("width", function(d, i) {return x.rangeBand();})
                .attr("height", function(d, i) {return y(0) - y(d);});
        },
    });

    return TestDetailView;
});

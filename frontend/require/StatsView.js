
define(['underscore', 'backbone', 'mustache', 'renderer', 'dygraph-combined', 'text!StatsView.html', 'd3', 'PrairieGeom', 'PrairieStats'], function(_, Backbone, Mustache, renderer, Dygraph, statsViewTemplate, d3, PrairieGeom, PrairieStats) {

    var StatsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.questions = this.options.questions;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.questions, "add", this.render);
        },

        render: function() {
            if (this.submissionsPerHour)
                this.submissionsPerHour.destroy();
            if (this.usersPerHour)
                this.usersPerHour.destroy();
            if (this.usersPerStartHourMidterm1)
                this.usersPerStartHourMidterm1.destroy();
            if (this.usersPerStartHourMidterm2)
                this.usersPerStartHourMidterm2.destroy();
            if (this.usersPerSubmissionCount)
                this.usersPerSubmissionCount.destroy();

            var submissionsPerHour = this.model.get("submissionsPerHour");
            var usersPerHour = this.model.get("usersPerHour");
            var usersPerStartHourMidterm1 = this.model.get("usersPerStartHourMidterm1");
            var usersPerStartHourMidterm2 = this.model.get("usersPerStartHourMidterm2");
            var usersPerSubmissionCount = this.model.get("usersPerSubmissionCount");
            var averageQScores = this.model.get("averageQScores");
            var uScores = this.model.get("uScores");
            var trueAvgScores = this.model.get("trueAvgScores");

            var renderData = {};
            if (submissionsPerHour)
                renderData.submissionsPerHourGenDate = new Date(submissionsPerHour.date).toString();
            if (usersPerHour)
                renderData.usersPerHourGenDate = new Date(usersPerHour.date).toString();
            if (usersPerStartHourMidterm1)
                renderData.usersPerStartHourMidterm1GenDate = new Date(usersPerStartHourMidterm1.date).toString();
            if (usersPerStartHourMidterm2)
                renderData.usersPerStartHourMidterm2GenDate = new Date(usersPerStartHourMidterm2.date).toString();
            if (usersPerSubmissionCount)
                renderData.usersPerSubmissionCountGenDate = new Date(usersPerSubmissionCount.date).toString();
            if (averageQScores)
                renderData.averageQScoresGenDate = new Date(averageQScores.date).toString();
            if (uScores)
                renderData.uScoresGenDate = new Date(uScores.date).toString();
            if (trueAvgScores)
                renderData.trueAvgScoresGenDate = new Date(trueAvgScores.date).toString();

            renderData.minPlotUserSubmissions = 100;
            renderData.minPlotUserQuestionAttempts = 10;

            if (averageQScores) {
                var scoresByQID = {};
                var i;
                for (i = 0; i < averageQScores.qScores.length; i++) {
                    scoresByQID[averageQScores.qScores[i].qid] = averageQScores.qScores[i];
                }
                var maxAttempts = 0;
                this.questions.each(function(q) {
                    qScore = scoresByQID[q.get("qid")];
                    if (qScore != null)
                        maxAttempts = Math.max(maxAttempts, qScore.n);
                });
                var items = [], item;
                var qScore;
                this.questions.each(function(q) {
                    item = {
                        qid: q.get("qid"),
                        title: q.get("title"),
                        number: q.get("number"),
                        avgAttempts: '',
                        avgScore: '',
                        predScore: '',
                        donePredScore: '',
                        attemptsProgress: '',
                        avgScoreProgress: '',
                        predScoreProgress: '',
                        donePredScoreProgress: ''
                    };
                    qScore = scoresByQID[q.get("qid")];
                    if (qScore != null) {
                        item.avgAttempts = renderer.attemptsLabel(qScore.n, undefined, qScore.n.toFixed(1));
                        item.attemptsProgress = renderer.countsProgressBar(qScore.nTypeCounts, 'student', renderer.attemptsToolTipTexts, "auto top", false, true);
                        if (qScore.n > 0) {
                            item.avgScore = renderer.scoreLabel(qScore.avgScore);
                            item.avgScoreProgress = renderer.countsProgressBar(qScore.avgScoreTypeCounts, 'answering student', renderer.avgScoreToolTipTexts, "auto bottom", false, true);
                        }
                        item.predScore = renderer.scoreLabel(qScore.predScore);
                        item.predScoreProgress = renderer.countsProgressBar(qScore.predScoreTypeCounts, 'student', renderer.predScoreToolTipTexts, "auto bottom", false, true);
                        item.donePredScore = renderer.scoreLabel(qScore.donePredScore);
                        item.donePredScoreProgress = renderer.countsProgressBar(qScore.donePredScoreTypeCounts, 'answering student', renderer.predScoreToolTipTexts, "auto bottom", false, true);
                    }
                    items.push(item);
                });
                renderData.questionList = items;
            }

            var html = Mustache.render(statsViewTemplate, renderData);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();

            var addCumulative = function(data, k) {
                // data must be an array of arrays
                // adds an extra entry to each data point by accumulating entry number k
                var i, n;
                if (data.length > 0) {
                    n = data[0].length;
                    data[0].push(data[0][k]);
                }
                for (i = 1; i < data.length; i++)
                    data[i].push(data[i - 1][n] + data[i][k]);
                var total = 0;
                if (data.length > 0)
                    total = data[data.length - 1][n];
                for (i = 0; i < data.length; i++)
                    data[i][n] *= 100 / total;
                return total;
            };
            
            if (submissionsPerHour) {
                var data = [], i;
                for (i = 0; i < submissionsPerHour.times.length; i++) {
                    data.push([new Date(submissionsPerHour.times[i]), submissionsPerHour.submissions[i]]);
                }
                //addCumulative(data, 1);
                var el = this.$("#submissionsPerHour").get(0);
                this.submissionsPerHour = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Answer submissions per hour",
                    xlabel: "date",
                    ylabel: "submissions / h",
                    //y2label: "fraction of submissions / %",
                    showRangeSelector: true,
                    labels: ["date", "submissions"],
                    //labels: ["date", "submissions", "cumulative"],
                    //axes: {
                    //    y2: {valueFormatter: function(num) {return num.toFixed(0) + "%";}}
                    //},
                    //cumulative: {axis: {digitsAfterDecimal: 0}}
                });
            }

            if (usersPerHour) {
                var data = [], i;
                for (i = 0; i < usersPerHour.times.length; i++) {
                    data.push([new Date(usersPerHour.times[i]), usersPerHour.users[i]]);
                }
                var el = this.$("#usersPerHour").get(0);
                this.usersPerHour = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Unique students per hour",
                    xlabel: "date",
                    ylabel: "students / h",
                    showRangeSelector: true,
                    labels: ["date", "students"]
                });
            }

            if (usersPerStartHourMidterm1) {
                var data = [], i;
                for (i = 0; i < usersPerStartHourMidterm1.hours.length; i++) {
                    data.push([usersPerStartHourMidterm1.hours[i] / 24, usersPerStartHourMidterm1.users[i]]);
                }
                var totalStudents = addCumulative(data, 1);
                var el = this.$("#usersPerStartHourMidterm1").get(0);
                this.usersPerStartHourMidterm1 = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Distribution of study durations for Midterm 1 (" + totalStudents + " students)",
                    xlabel: "study duration / days",
                    ylabel: "number of students",
                    y2label: "fraction of students / %",
                    showRangeSelector: true,
                    labels: ["time", "students", "cumulative"],
                    axes: {
                        x: {valueFormatter: function(num) {return num.toFixed(2);}},
                        y2: {valueFormatter: function(num) {return num.toFixed(0) + "%";}}
                    },
                    cumulative: {axis: {digitsAfterDecimal: 0}}
                });
            }

            if (usersPerStartHourMidterm2) {
                var data = [], i;
                for (i = 0; i < usersPerStartHourMidterm2.hours.length; i++) {
                    data.push([usersPerStartHourMidterm2.hours[i] / 24, usersPerStartHourMidterm2.users[i]]);
                }
                var totalStudents = addCumulative(data, 1);
                var el = this.$("#usersPerStartHourMidterm2").get(0);
                this.usersPerStartHourMidterm2 = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Distribution of study durations for Midterm 2 (" + totalStudents + " students)",
                    xlabel: "study duration / days",
                    ylabel: "number of students",
                    y2label: "fraction of students / %",
                    showRangeSelector: true,
                    labels: ["time", "students", "cumulative"],
                    axes: {
                        x: {valueFormatter: function(num) {return num.toFixed(2);}},
                        y2: {valueFormatter: function(num) {return num.toFixed(0) + "%";}}
                    },
                    cumulative: {axis: {digitsAfterDecimal: 0}}
                });
            }

            if (usersPerSubmissionCount) {
                var groupSize = 10;
                var data = [], i, g;
                for (i = 0; i < usersPerSubmissionCount.submissions.length; i++) {
                    g = Math.floor(i / groupSize);
                    if (i % groupSize === 0) {
                        data.push([
                            usersPerSubmissionCount.submissions[i],
                            usersPerSubmissionCount.users[i]
                        ]);
                    } else {
                        data[g][1] += usersPerSubmissionCount.users[i];
                    }
                }
                addCumulative(data, 1);
                var el = this.$("#usersPerSubmissionCount").get(0);
                this.usersPerSubmissionCount = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Distribution of submissions",
                    xlabel: "number of submissions",
                    ylabel: "number of students",
                    y2label: "fraction of students / %",
                    showRangeSelector: true,
                    labels: ["submissions", "users", "cumulative"],
                    axes: {
                        y2: {valueFormatter: function(num) {return num.toFixed(0) + "%";}}
                    },
                    cumulative: {axis: {digitsAfterDecimal: 0}}
                });
            }

            var scatterPlot = function(selector, data, xlabel, ylabel) {
                var margin = {top: 20, right: 20, bottom: 60, left: 70},
                width = 500 - margin.left - margin.right,
                height = 500 - margin.top - margin.bottom;

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

                var svg = d3.select(selector).append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                var xData = _.map(data, function(d) {return d[0];});
                var yData = _.map(data, function(d) {return d[1];});

                var linFit = PrairieStats.linearRegression(xData, yData);
                var corrcoeff = PrairieStats.corrcoeff(xData, yData);

                var xExtent = d3.extent(xData);
                var yExtent = d3.extent(yData);
                var xRange = xExtent[1] - xExtent[0];
                var yRange = yExtent[1] - yExtent[0];
                xExtent = [xExtent[0] - 0.05 * xRange, xExtent[1] + 0.05 * xRange];
                yExtent = [yExtent[0] - 0.05 * yRange, yExtent[1] + 0.05 * yRange];
                x.domain(xExtent);
                y.domain(yExtent);

                svg.append("g")
                    .attr("class", "x grid")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xGrid)

                svg.append("g")
                    .attr("class", "y grid")
                    .call(yGrid)

                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis)
                    .append("text")
                    .attr("class", "label")
                    .attr("x", width / 2)
                    .attr("y", "3em")
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
                    .text(ylabel)

                svg.append("line")
                    .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

                svg.append("line")
                    .attr({x1: width, y1: 0, x2: width, y2: height, "class": "y axis"})

                svg.selectAll(".dot")
                    .data(data)
                    .enter().append("circle")
                    .attr("class", "dot")
                    .attr("r", 1)
                    .attr("cx", function(d) { return x(d[0]); })
                    .attr("cy", function(d) { return y(d[1]); })

                var x1 = xExtent[0];
                var x2 = xExtent[1];
                var y1 = PrairieGeom.evalPoly(linFit, x1);
                var y2 = PrairieGeom.evalPoly(linFit, x2);

                svg.append("line")
                    .attr("x1", x(x1))
                    .attr("y1", y(y1))
                    .attr("x2", x(x2))
                    .attr("y2", y(y2))
                    .attr("class", "fitLine")

                svg.append("text")
                    .attr("x", "1em")
                    .attr("y", "2em")
                    .attr("class", "label")
                    .text("r = " + corrcoeff.toFixed(2));
            };

            if (uScores) {
                var data = [];
                var i, x, y, uScore;
                for (i = 0; i < uScores.uScores.length; i++) {
                    uScore = uScores.uScores[i];
                    x = uScore.midterm1;
                    y = uScore.midterm2;
                    if (x > 0 && y > 0)
                        data.push([x, y]);
                }
                scatterPlot("#Midterm1VsMidterm2", data, "Midterm 1 score / %", "Midterm 2 score / %");
            }

            /*
            if (averageQScores) {
                var data = [];
                var i;
                for (i = 0; i < averageQScores.qScores.length; i++) {
                    data.push([averageQScores.qScores[i].avgScore * 100, averageQScores.qScores[i].predScore * 100]);
                }
                scatterPlot("#predScoreVsAvgScore", data, "average score / %", "predicted score / %");
            }
            */

            if (uScores) {
                var data = [];
                var i, x, y1, y2, uScore;
                for (i = 0; i < uScores.uScores.length; i++) {
                    uScore = uScores.uScores[i];
                    x = uScore.gpaSTEM;
                    y1 = uScore.midterm1;
                    y2 = uScore.midterm2;
                    if (x > 0 && y1 > 0 && y2 > 0)
                        data.push([x, y1 + y2]);
                }
                scatterPlot("#gpaSTEMVsMidterm", data, "STEM GPA", "Midterm total score / %");
            }

            if (uScores) {
                var data = [];
                var i, x, y1, y2, uScore;
                for (i = 0; i < uScores.uScores.length; i++) {
                    uScore = uScores.uScores[i];
                    x = uScore.avgPredScore * 100;
                    y1 = uScore.midterm1;
                    y2 = uScore.midterm2;
                    if (x > 0 && y1 > 0 && y2 > 0 && uScore.nSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([x, y1 + y2]);
                }
                scatterPlot("#userPredScoreVsMidterm", data, "predicted average score / %", "Midterm total score / %");
            }

            if (uScores) {
                var data = [];
                var i, x, y1, y2, uScore;
                for (i = 0; i < uScores.uScores.length; i++) {
                    uScore = uScores.uScores[i];
                    x = uScore.dist.sigma.mean[0];
                    y1 = uScore.midterm1;
                    y2 = uScore.midterm2;
                    if (x > 0 && y1 > 0 && y2 > 0 && uScore.nSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([x, y1 + y2]);
                }
                scatterPlot("#sigmaVsMidterm", data, "sigma mean", "Midterm total score / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.qScores.length; i++) {
                    data.push([trueAvgScores.qScores[i].avgCorrectBySubmission * 100, trueAvgScores.qScores[i].predCorrectBySubmission * 100]);
                }
                scatterPlot("#predScoreVsTrueAvgQSubScore", data, "average question score (by submission) / %", "predicted question score (by submission) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.qScores.length; i++) {
                    data.push([trueAvgScores.qScores[i].avgCorrectByUser * 100, trueAvgScores.qScores[i].predCorrectByUser * 100]);
                }
                scatterPlot("#predScoreVsTrueAvgQUserScore", data, "average question score (by user) / %", "predicted question score (by user) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([trueAvgScores.uScores[i].avgCorrectBySubmission * 100, trueAvgScores.uScores[i].predCorrectBySubmission * 100]);
                }
                scatterPlot("#predScoreVsTrueAvgUSubScore", data, "average user score (by submission) / %", "predicted user score (by submission) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([trueAvgScores.uScores[i].avgCorrectBySubmission * 100, trueAvgScores.uScores[i].dist.sigma.mean[0]]);
                }
                scatterPlot("#sigmaVsTrueAvgUSubScore", data, "average user score (by submission) / %", "sigma mean");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([trueAvgScores.uScores[i].avgCorrectByQuestion * 100, trueAvgScores.uScores[i].predCorrectByQuestion * 100]);
                }
                scatterPlot("#predScoreVsTrueAvgUQuestionScore", data, "average user score (by question) / %", "predicted user score (by question) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions)
                        data.push([trueAvgScores.uScores[i].avgCorrectByQuestion * 100, trueAvgScores.uScores[i].dist.sigma.mean[0]]);
                }
                scatterPlot("#sigmaVsTrueAvgUQuestionScore", data, "average user score (by question) / %", "sigma mean");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions && trueAvgScores.uScores[i].gpaSTEM > 0)
                        data.push([trueAvgScores.uScores[i].gpaSTEM, trueAvgScores.uScores[i].avgCorrectBySubmission * 100]);
                }
                scatterPlot("#gpaSTEMVsTrueAvgUSubScore", data, "STEM GPA", "average user score (by submission) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uScores.length; i++) {
                    if (trueAvgScores.uScores[i].totalSubmissions >= renderData.minPlotUserSubmissions && trueAvgScores.uScores[i].gpaSTEM > 0)
                        data.push([trueAvgScores.uScores[i].gpaSTEM, trueAvgScores.uScores[i].avgCorrectByQuestion * 100]);
                }
                scatterPlot("#gpaSTEMVsTrueAvgUQuestionScore", data, "STEM GPA", "average user score (by question) / %");
            }

            if (trueAvgScores) {
                var data = [];
                var i;
                for (i = 0; i < trueAvgScores.uqScores.length; i++) {
                    if (trueAvgScores.uqScores[i].nAttempts >= renderData.minPlotUserQuestionAttempts)
                        data.push([trueAvgScores.uqScores[i].predScore * 100, trueAvgScores.uqScores[i].avgScore * 100]);
                }
                scatterPlot("#predVsTrueAvgUQScore", data, "predicted score / %", "average user score / %");
            }
        },

        close: function() {
            if (this.submissionsPerHour)
                this.submissionsPerHour.destroy();
            if (this.usersPerHour)
                this.usersPerHour.destroy();
            if (this.usersPerStartHourMidterm1)
                this.usersPerStartHourMidterm1.destroy();
            if (this.usersPerStartHourMidterm2)
                this.usersPerStartHourMidterm2.destroy();
            if (this.usersPerSubmissionCount)
                this.usersPerSubmissionCount.destroy();
            this.remove();
        }
    });

    return {
        StatsView: StatsView
    };
});

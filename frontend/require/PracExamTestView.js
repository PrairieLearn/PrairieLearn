
define(["underscore", "backbone", "mustache", "PracExamTestHelper", "text!PracExamTestView.html"], function(_, Backbone, Mustache, PracExamTestHelper, PracExamTestViewTemplate) {

    var PracExamTestView = Backbone.View.extend({
        tagName: 'div',

        events: {
            "click .doExam": "doExam",
        },

        initialize: function() {
            this.appModel = this.options.appModel;
            this.tInstances = this.options.tInstances;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.tInstances, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.title = this.model.get("title");
            data.tid = this.model.get("tid");
            var nQuestions = this.model.get("nQuestions");
            data.nQuestions = nQuestions;
            data.timeLimitMin = this.model.get("timeLimitMin");

            data.attemptsList = [];
            this.tInstances.each(function(tInstance, index) {
                if (tInstance.get("tid") !== that.model.get("tid"))
                    return;
                var attempt = {
                    title: that.model.get("title"),
                    number: tInstance.get("number"),
                    tiid: tInstance.get("tiid"),
                };
                attempt.open = tInstance.get("open");
                if (attempt.open) {
                    var timeRemainingMin = Math.floor((Date.parse(tInstance.get("dueDate")) - Date.now()) / (60 * 1000));
                    if (timeRemainingMin < 0)
                        attempt.timeRemaining = "Time expired";
                    else
                        attempt.timeRemaining = timeRemainingMin + " min remaining";
                } else {
                    var finishDate = new Date(tInstance.get("finishDate"));
                    var options = {hour: "numeric", minute: "numeric"};
                    var dateString = finishDate.toLocaleTimeString("en-US", options);
                    options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
                    dateString += ", " + finishDate.toLocaleDateString("en-US", options);
                    attempt.finishDate = dateString;
                    attempt.nCorrect = tInstance.get("score");
                    attempt.nQuestions = tInstance.get("qids").length;
                    attempt.correctPercentage = (attempt.nCorrect / attempt.nQuestions * 100).toFixed(0);
                }
                data.attemptsList.push(attempt);
            });
            data.seeDetail = this.appModel.hasPermission("viewOtherUsers");

            var html = Mustache.render(PracExamTestViewTemplate, data);
            this.$el.html(html);

            var highScoreHist = this.model.get("completeHighScores");
            var highScoreData = _(highScoreHist).map(function(value, key) {
                return [
                    (parseFloat(key) - 0.5) / nQuestions * 100,
                    (parseFloat(key) + 0.5) / nQuestions * 100,
                    value
                ];
            });
            this.renderScoreHistogram("#highScoreHistogramPlot", highScoreData, "score / %", "number of students", "Completed-high-score distribution for entire class");
        },

        doExam: function() {
            this.trigger("createTestInstance");
        },

        close: function() {
            this.remove();
        },

        renderScoreHistogram: function(selector, data, xlabel, ylabel, title) {
            var margin = {top: 40, right: 20, bottom: 50, left: 70},
            width = 500 - margin.left - margin.right,
            height = 200 - margin.top - margin.bottom;

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
                .ticks(5)
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
                .attr("class", "center-block")
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            //var xData = _.map(data, function(d) {return d[0];});
            var yData = _.map(data, function(d) {return d[2];});

            var xExtent = [0, 100]; //d3.extent(xData);
            var yExtent = d3.extent(yData);
            yExtent[0] = 0;
            if (!(yExtent[1] > 1))
                yExtent[1] = 1; // also catches undefined
            var xRange = xExtent[1] - xExtent[0];
            var yRange = yExtent[1] - yExtent[0];
            xExtent = [xExtent[0] - 0.05 * xRange, xExtent[1] + 0.05 * xRange];
            yExtent = [yExtent[0], yExtent[1] + 0.05 * yRange];
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
                .text(ylabel)

            svg.append("g")
                .append("text")
                .attr("class", "label")
                .attr("x", width / 2)
                .attr("y", "-1em")
                .style("text-anchor", "middle")
                .text(title)

            svg.append("line")
                .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

            svg.append("line")
                .attr({x1: width, y1: 0, x2: width, y2: height, "class": "y axis"})

            svg.selectAll(".bar")
                .data(data)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", function(d) { return x(d[0]); })
                .attr("y", function(d) { return y(d[2]); })
                .attr("width", function(d) { return x(d[1]) - x(d[0]); })
                .attr("height", function(d) { return y(0) - y(d[2]); })
        },
    });

    return PracExamTestView;
});

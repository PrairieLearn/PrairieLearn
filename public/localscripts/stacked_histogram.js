function stacked_histogram(selector, data, data2, bucketNames, options) {
    options = options || {};
    _.defaults(options, {
        width: 100,
        height: 40,
        xmin: "auto",
        xmax: "auto",
        ymin: "auto",
        ymax: "auto",
        xlabel: "value",
        ylabel: "count",
        xTickLabels: "auto",
        topMargin: 10,
        rightMargin: 20,
        bottomMargin: 55,
        leftMargin: 70,
        xAxisScale: null,
    });

    var width = 600 - options.leftMargin - options.rightMargin;
    var height = 371 - options.topMargin - options.bottomMargin;

    var x = d3.scale.ordinal()
            .domain(bucketNames)
            .rangeBands([0, width]);

    var xAxisScale;
    if (options.xAxisScale) {
        xAxisScale = options.xAxisScale.range([0, width]);
    } else {
        xAxisScale = x;
    }

    var ymin = (options.ymin == "auto" ? _(data).min() : options.ymin);
    var ymax = (options.ymax == "auto" ? _(data).max() + _(data2).max() : options.ymax);
    var y = d3.scale.linear()
        .domain([ymin, ymax])
        .nice()
        .range([height, 0]);

    var xTickFormat = (options.xTickLabels == "auto" ? null
                       : function(d, i) {return options.xTickLabels[i];});
    var xAxis = d3.svg.axis()
        .scale(xAxisScale)
        .tickFormat(xTickFormat)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left");
    
    var yGrid = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickSize(-width)
        .tickFormat("");

    var svg = d3.select(this.$(selector).get(0)).append("svg")
        .attr("width", width + options.leftMargin + options.rightMargin)
        .attr("height", height + options.topMargin + options.bottomMargin)
        .attr("class", "center-block statsPlot")
        .append("g")
        .attr("transform", "translate(" + options.leftMargin + "," + options.topMargin + ")");

    svg.append("g")
        .attr("class", "y grid")
        .call(yGrid);

    svg.selectAll(".outlineBar")
        .data(data) // .data(_.times(data.length, _.constant(0)))
        .enter().append("rect")
        .attr("class", "outlineBar")
        .attr("x", function(d, i) {return x(bucketNames[i]);})
        .attr("y", function(d, i) {return y(d);})
        .attr("width", function(d, i) {return x(bucketNames[1]) - x(bucketNames[0]);})
        .attr("height", function(d, i) {return y(0) - y(d);});

    svg.selectAll(".outlineBarRed")
        .data(data2)
        .enter().append("rect")
        .attr("class", "outlineBarRed")
        .attr("x", function(d, i) {return x(bucketNames[i]);})
        .attr("y", function(d, i) {return y(data[i] + data2[i]);})
        .attr("width", function(d, i) {return x(bucketNames[1]) - x(bucketNames[0]);})
        .attr("height", function(d, i) {return y(0) - y(d);});

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
        .append("text")
        .attr("class", "label")
        .attr("x", width / 2)
        .attr("y", "3em")
        .style("text-anchor", "middle")
        .text(options.xlabel);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
        .append("text")
        .attr("class", "label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", "-3em")
        .style("text-anchor", "middle")
        .text(options.ylabel);

    svg.append("line")
        .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

    svg.append("line")
        .attr({x1: width, y1: 0, x2: width, y2: height, "class": "y axis"});
};

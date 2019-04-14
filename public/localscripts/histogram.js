function histogram(selector, data, xgrid, options) {
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
        xOrdinal: false,
    });

    var width = 600 - options.leftMargin - options.rightMargin;
    var height = 371 - options.topMargin - options.bottomMargin;

    var xmin = (options.xmin == "auto" ? _(xgrid).min() : options.xmin);
    var xmax = (options.xmax == "auto" ? _(xgrid).max() : options.xmax);
    var x = d3.scale.linear()
        .domain([xmin, xmax])
        .range([0, width]);

    var xOrdinalScale = d3.scale.ordinal()
        .domain(_.range(1, data.length + 1))
        .rangeBands([0, width]);
        // .domain([xmin, xmax])
        // .rangeRoundBands([0, width], 0.0);

    var ymin = (options.ymin == "auto" ? _(data).min() : options.ymin);
    var ymax = (options.ymax == "auto" ? _(data).max() : options.ymax);
    var y = d3.scale.linear()
        .domain([ymin, ymax])
        .nice()
        .range([height, 0]);

    var xTickFormat = (options.xTickLabels == "auto" ? null
                       : function(d, i) {return options.xTickLabels[i];});
    var xAxis = d3.svg.axis();

    if (options.xOrdinal) {
        xAxis.scale(xOrdinalScale);
    } else {
        xAxis.scale(x);
    }

    xAxis
        .tickValues(xgrid)
        .tickFormat(xTickFormat)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left");

    var xGrid = d3.svg.axis();
    if (options.xOrdinal) {
        var xScale = d3.scale.linear()
            .domain([0, data.length])
            .range([0, width]);
        xGrid.scale(xScale);
    } else {
        xGrid.scale(x);
    }

    xGrid
        .tickValues(xgrid)
        .orient("bottom")
        .tickSize(-height)
        .tickFormat("");

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
        .attr("class", "x grid")
        .attr("transform", "translate(0," + height + ")")
        .call(xGrid);

    svg.append("g")
        .attr("class", "y grid")
        .call(yGrid);

    var rects = svg.selectAll(".outlineBar")
        .data(data) // .data(_.times(data.length, _.constant(0)))
        .enter().append("rect")
        .attr("class", "outlineBar");

    if (options.xOrdinal) {
        rects
            .attr("x", function(d, i) { return xOrdinalScale(i + 1); })
            .attr("width", function() { return xOrdinalScale.rangeBand(); });
    } else {
        rects
            .attr("x", function(d, i) { return x(xgrid[i]); })
            // .attr("x", function(d, i) { console.log("i: " + i + ", d: " + d + ", xgrid[i]: " + xgrid[i]); return x(xgrid[i]); })
            .attr("width", function(d, i) { return x(xgrid[1]) - x(xgrid[0]); });
    }
    rects
        .attr("y", function(d, i) {return y(d);})
        .attr("height", function(d, i) {return y(0) - y(d);});

    /*
      svg.selectAll(".outlineBar")
      .data(data)
      .transition()
      .duration(3000)
      .attr("y", function(d, i) {return y(d);})
      .attr("height", function(d, i) {return y(0) - y(d);});
    */

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

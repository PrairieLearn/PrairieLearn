
function toPercentages(data) {
    const total = data.reduce((sum, value) => sum + value);
    return data.map(val => val / total);
}

function histmini(selector, data, options, barChart) {
    options = options || {};
    _.defaults(options, {
        width: 100,
        height: 40,
        xmin: 0,
        xmax: 100,
        ymin: 0,
        ymax: "auto",
    });

    var margin = {top: 1, right: 1, bottom: 1, left: 1},
        width = options.width - margin.left - margin.right,
        height = options.height - margin.top - margin.bottom;

    var x = d3.scale.ordinal()
        .domain(d3.range(data.length))
        .rangeRoundBands([0, width], 0.2);

    var ymin = (options.ymin == "auto" ? _(data).min() : options.ymin);
    var ymax = (options.ymax == "auto" ? _(data).max() : options.ymax);
    var y = d3.scale.linear()
        .domain([ymin, ymax])
        .range([height, 0]);

    var color = d3.scale.category10();

    var svg = d3.select($(selector).get(0)).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .attr("class", "center-block statsPlot")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var barConfiguration = svg.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d, i) {return x(i);})
        .attr("y", function(d, i) {return y(d);})
        .attr("width", function(d, i) {return x.rangeBand();})
        .attr("height", function(d, i) {return y(0) - y(d);});

    var colors = ["blue", "red", "green", "yellow", "orange", "purple"];
    if (barChart) {
        barConfiguration.style("fill", function(d, i) { return colors[i % 6]; });
    }

    svg.append("line")
        .attr({x1: 0, y1: 0, x2: width, y2: 0, "class": "x axis"})

    svg.append("line")
        .attr({x1: 0, y1: height, x2: width, y2: height, "class": "x axis"})
};

function parallel_histograms(selector, data, options) {
  options = options || {};

  _.defaults(options, {
    width: 600,
    height: 370,
    xTickLabels: 'auto',
    yTickLabels: 'auto',
    yAxisWidth: 70,
    xAxisHeight: 70,
    topPadding: 15,
    rightPadding: 2,
  });

  var width = options.width;
  var height = options.height;

  var xTickLabels = options.xTickLabels;
  var yTickLabels = options.yTickLabels;

  var yAxisWidth = options.yAxisWidth;
  var xAxisHeight = options.xAxisHeight;

  var topPadding = options.topPadding;
  var rightPadding = options.rightPadding;

  var totalWidth = width + yAxisWidth + rightPadding;
  var heightWithPadding = height + topPadding;
  var totalHeight = heightWithPadding + xAxisHeight;

  var numBuckets = data[0].histogram.length;
  var numDays = data.length;

  var yOrdinal = d3.scaleBand().domain(d3.range(numBuckets)).rangeRound([0, height]);

  var yLinear = d3.scaleLinear().domain([0, numBuckets]).range([0, height]);

  var xOrdinal = d3.scaleBand().domain(d3.range(numDays)).rangeRound([0, width]).padding(0.0);

  var xLinear = d3.scaleLinear().domain([0, numDays]).range([0, width]);

  var plot = d3
    .select(this.$(selector).get(0))
    .insert('svg', ':first-child')
    .attr('index', index)
    .attr('width', totalWidth)
    .attr('height', totalHeight)
    .attr('class', 'center-block statsPlot');

  var yTickFormat = function (d, i) {
    return data[i].label;
  };

  var verticalGridLinear = d3.axisBottom().scale(xLinear).tickSize(-height).tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', 'translate(' + yAxisWidth + ',' + heightWithPadding + ')')
    .call(verticalGridLinear);

  var verticalGridOrdinal = d3.axisBottom().scale(xOrdinal).tickSize(-height).tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', 'translate(' + yAxisWidth + ',' + heightWithPadding + ')')
    .call(verticalGridOrdinal);

  var horizontalGrid = d3.axisLeft().scale(yLinear).tickSize(-width).tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', function (d) {
      return 'translate(' + yAxisWidth + ',' + topPadding + ')';
    })
    .call(horizontalGrid);

  var max = calculate_max(data);

  var width_per_day = width / numDays;
  var height_per_bucket = height / numBuckets;

  for (var index = 0; index < data.length; index++) {
    var histogram = data[index].histogram;
    var mean = data[index].mean;

    var widthForBucketFunction = function (i) {
      return (histogram[i] / max) * width_per_day;
    };

    var xOffset = (index + 0.5) * width_per_day + yAxisWidth;

    var g = plot.append('g').attr('transform', 'translate(' + xOffset + ', 0)');

    g.selectAll('.bar')
      .data(histogram)
      .enter()
      .append('rect')
      .attr('class', 'outlineBar')
      .attr('x', function (d, i) {
        return widthForBucketFunction(i) * -0.5;
      })
      .attr('y', function (d, i) {
        return heightWithPadding - yLinear(i + 1);
      })
      .attr('width', function (d, i) {
        return widthForBucketFunction(i);
      })
      .attr('height', function (d, i) {
        return height_per_bucket;
      });

    g.append('line')
      .attr('class', 'parallelHistMean')
      .attr('x1', function (d) {
        return -width_per_day / 2;
      })
      .attr('x2', function (d) {
        return width_per_day / 2;
      })
      .attr('y1', function (d) {
        return heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets);
      })
      .attr('y2', function (d) {
        return heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets);
      });
  }

  var yAxis = d3
    .axisLeft()
    .tickFormat(function (d, i) {
      return yTickLabels[i];
    })
    .scale(yLinear);

  plot
    .append('g')
    .attr('class', 'y axis')
    .attr('transform', function (d) {
      return 'translate(' + yAxisWidth + ', ' + topPadding + ')';
    })
    .call(yAxis)
    .append('text')
    .attr('class', 'label')
    .text(options.ylabel);

  // it's rotated, so x means y, and y means x
  plot
    .selectAll('text.label')
    .attr('y', -50)
    .attr('x', (-1 * heightWithPadding) / 2)
    .attr('dy', '.35em')
    .attr('transform', 'rotate(-90)')
    .style('text-anchor', 'start');

  plot.append('line').attr({
    x1: yAxisWidth,
    y1: topPadding,
    x2: width + yAxisWidth,
    y2: topPadding,
    class: 'x axis',
  });

  plot.append('line').attr({
    x1: width + yAxisWidth,
    y1: topPadding,
    x2: width + yAxisWidth,
    y2: heightWithPadding,
    class: 'y axis',
  });

  var xTickFormat =
    options.xTickLabels == 'auto'
      ? null
      : function (d, i) {
          return options.xTickLabels[i];
        };

  var xAxis = d3
    .axisBottom()
    .scale(xOrdinal)
    .tickFormat(function (d, i) {
      return data[i].label;
    })
    .ticks(10);

  xAxisElement = plot
    .append('g')
    .attr('class', 'x axis')
    .attr('transform', function (d) {
      return 'translate(' + yAxisWidth + ', ' + heightWithPadding + ')';
    })
    .attr('height', xAxisHeight)
    .call(xAxis)
    .append('text')
    .attr('class', 'label')
    .attr('x', width / 2)
    .attr('y', '3em')
    .style('text-anchor', 'middle')
    .text(options.xlabel);
}

function calculate_max(data) {
  var max = 0;
  for (var index = 0; index < data.length; index++) {
    var histogram = data[index].histogram;
    var max_value = Math.max.apply(Math, histogram);
    if (max_value > max) {
      max = max_value;
    }
  }

  max = max * 1.1;
  return max;
}

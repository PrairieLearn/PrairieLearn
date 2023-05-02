function scatter(selector, xdata, ydata, options) {
  options = options || {};
  _.defaults(options, {
    width: 600,
    height: 600,
    xmin: 'auto',
    xmax: 'auto',
    ymin: 'auto',
    ymax: 'auto',
    xlabel: 'value',
    ylabel: 'count',
    xgrid: 'auto',
    ygrid: 'auto',
    xTickLabels: 'auto',
    yTickLabels: 'auto',
    topMargin: 10,
    rightMargin: 20,
    bottomMargin: 55,
    leftMargin: 70,
    radius: 2,
    labels: {},
  });

  var width = options.width - options.leftMargin - options.rightMargin;
  var height = options.height - options.topMargin - options.bottomMargin;

  var xmin = options.xmin == 'auto' ? _(options.xgrid).min() : options.xmin;
  var xmax = options.xmax == 'auto' ? _(options.xgrid).max() : options.xmax;
  var x = d3.scaleLinear().domain([xmin, xmax]).range([0, width]);

  var ymin = options.ymin == 'auto' ? _(options.ygrid).min() : options.ymin;
  var ymax = options.ymax == 'auto' ? _(options.ygrid).max() : options.ymax;
  var y = d3.scaleLinear().domain([ymin, ymax]).range([height, 0]);

  xdata = xdata.filter($.isNumeric);
  ydata = ydata.filter($.isNumeric);
  xdata = xdata.map(function (x) {
    return Math.max(xmin, Math.min(xmax, x));
  });
  ydata = ydata.map(function (y) {
    return Math.max(ymin, Math.min(ymax, y));
  });

  var xTickFormat =
    options.xTickLabels == 'auto'
      ? null
      : function (d, i) {
          return options.xTickLabels[i];
        };

  var xAxis = d3.axisBottom().scale(x).tickValues(options.xgrid).tickFormat(xTickFormat);

  var yTickFormat =
    options.yTickLabels == 'auto'
      ? null
      : function (d, i) {
          return options.yTickLabels[i];
        };
  var yAxis = d3.axisLeft().scale(y).tickValues(options.ygrid).tickFormat(yTickFormat);

  var xGrid = d3.axisBottom().scale(x).tickValues(options.xgrid).tickSize(-height).tickFormat('');

  var yGrid = d3.axisLeft().scale(y).tickValues(options.ygrid).tickSize(-width).tickFormat('');

  var svg = d3
    .select(this.$(selector).get(0))
    .append('svg')
    .attr('width', width + options.leftMargin + options.rightMargin)
    .attr('height', height + options.topMargin + options.bottomMargin)
    .attr('class', 'center-block statsPlot')
    .append('g')
    .attr('transform', 'translate(' + options.leftMargin + ',' + options.topMargin + ')');

  svg
    .append('g')
    .attr('class', 'x grid')
    .attr('transform', 'translate(0,' + height + ')')
    .call(xGrid);

  svg.append('g').attr('class', 'y grid').call(yGrid);

  svg
    .append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0,' + height + ')')
    .call(xAxis)
    .append('text')
    .attr('class', 'label')
    .attr('x', width / 2)
    .attr('y', '3em')
    .style('text-anchor', 'middle')
    .text(options.xlabel);

  svg
    .append('g')
    .attr('class', 'y axis')
    .call(yAxis)
    .append('text')
    .attr('class', 'label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', '-3em')
    .style('text-anchor', 'middle')
    .text(options.ylabel);

  svg.append('line').attr({ x1: 0, y1: 0, x2: width, y2: 0, class: 'x axis' });

  svg.append('line').attr({ x1: width, y1: 0, x2: width, y2: height, class: 'y axis' });

  // zips the data used to create the scatter plot
  // each data point has value [x, y, label]
  // if options.labels is not specified, then each data point will have an undefined label, and no labels will appear in the plot
  var pData = d3.zip(xdata, ydata, options.labels);

  var nodes = svg.selectAll('.point').data(pData).enter().append('g');

  nodes
    .append('circle')
    .attr('class', 'point')
    .attr('cx', function (p) {
      return x(p[0]);
    })
    .attr('cy', function (p) {
      return y(p[1]);
    })
    .attr('r', function (p) {
      return options.radius;
    });

  nodes
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('class', 'pointLabel')
    .attr('x', function (p) {
      return x(p[0]);
    })
    .attr('y', function (p) {
      return y(p[1]) - 6;
    })
    .text(function (p) {
      return p[2];
    });
}

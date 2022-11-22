function histmini(selector, data, options) {
  if (!_.isArray(data) || data.length == 0) return;

  options = options || {};
  _.defaults(options, {
    width: 100,
    height: 40,
    xmin: 0,
    xmax: 100,
    ymin: 0,
    ymax: 'auto',
    normalize: false,
  });

  if (options.normalize) {
    const total = data.reduce((sum, value) => sum + value);
    data = data.map((val) => val / total);
  }

  var margin = { top: 1, right: 1, bottom: 1, left: 1 },
    width = options.width - margin.left - margin.right,
    height = options.height - margin.top - margin.bottom;

  var x = d3.scaleBand().domain(d3.range(data.length)).rangeRound([0, width]).padding(0.2);

  var ymin = options.ymin == 'auto' ? _(data).min() : options.ymin;
  var ymax = options.ymax == 'auto' ? _(data).max() : options.ymax;
  var y = d3.scaleLinear().domain([ymin, ymax]).range([height, 0]);

  var color = d3.scaleOrdinal(d3.schemeCategory10);

  var svg = d3
    .select($(selector).get(0))
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .attr('class', 'center-block statsPlot')
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  var barConfiguration = svg
    .selectAll('.bar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', function (d, i) {
      return x(i);
    })
    .attr('y', function (d, i) {
      return y(d);
    })
    .attr('width', function (d, i) {
      return x.bandwidth();
    })
    .attr('height', function (d, i) {
      return y(0) - y(d);
    });

  svg
    .append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', width)
    .attr('y2', 0)
    .attr('class', 'x axis');

  svg
    .append('line')
    .attr('x1', 0)
    .attr('y1', height)
    .attr('x2', width)
    .attr('y2', height)
    .attr('class', 'x axis');
}

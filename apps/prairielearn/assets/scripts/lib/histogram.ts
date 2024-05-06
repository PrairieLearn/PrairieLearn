declare global {
  interface Window {
    _: any;
    d3: any;
  }
}

export function histogram(
  selector: Element,
  data: number[],
  xgrid: number[],
  options: {
    width: number;
    height: number;
    xmin: number | 'auto';
    xmax: number | 'auto';
    ymin: number | 'auto';
    ymax: number | 'auto';
    xlabel: string;
    ylabel: string;
    xTickLabels: string[] | 'auto';
    topMargin: number;
    rightMargin: number;
    bottomMargin: number;
    leftMargin: number;
  },
) {
  options = options || {};
  window._.defaults(options, {
    width: 100,
    height: 40,
    xmin: 'auto',
    xmax: 'auto',
    ymin: 'auto',
    ymax: 'auto',
    xlabel: 'value',
    ylabel: 'count',
    xTickLabels: 'auto',
    topMargin: 10,
    rightMargin: 20,
    bottomMargin: 55,
    leftMargin: 70,
  });

  const width = 600 - options.leftMargin - options.rightMargin;
  const height = 371 - options.topMargin - options.bottomMargin;

  const xmin = options.xmin === 'auto' ? window._(xgrid).min() : options.xmin;
  const xmax = options.xmax === 'auto' ? window._(xgrid).max() : options.xmax;
  const x = window.d3.scaleLinear().domain([xmin, xmax]).range([0, width]);

  const ymin = options.ymin === 'auto' ? window._(data).min() : options.ymin;
  const ymax = options.ymax === 'auto' ? window._(data).max() : options.ymax;
  const y = window.d3.scaleLinear().domain([ymin, ymax]).nice().range([height, 0]);

  const xTickFormat =
    options.xTickLabels === 'auto'
      ? null
      : function (d: null, i: number) {
          return options.xTickLabels[i];
        };
  const xAxis = window.d3.axisBottom().scale(x).tickValues(xgrid).tickFormat(xTickFormat);

  const yAxis = window.d3.axisLeft().scale(y);

  const xGrid = window.d3.axisBottom().scale(x).tickValues(xgrid).tickSize(-height).tickFormat('');

  const yGrid = window.d3.axisLeft().scale(y).tickSize(-width).tickFormat('');

  const svg = window.d3
    .select($(selector).get(0))
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
    .selectAll('.outlineBar')
    .data(data) // .data(_.times(data.length, _.constant(0)))
    .enter()
    .append('rect')
    .attr('class', 'outlineBar')
    .attr('x', function (d: null, i: number) {
      return x(xgrid[i]);
    })
    .attr('y', function (d: number) {
      return y(d);
    })
    .attr('width', function (d: null, i: number) {
      return x(xgrid[i + 1]) - x(xgrid[i]);
    })
    .attr('height', function (d: number) {
      return y(0) - y(d);
    });

  /*
        svg.selectAll(".outlineBar")
        .data(data)
        .transition()
        .duration(3000)
        .attr("y", function(d, i) {return y(d);})
        .attr("height", function(d, i) {return y(0) - y(d);});
      */

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
}

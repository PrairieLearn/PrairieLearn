declare global {
  interface Window {
    d3: any;
  }
}

export function scatter(
  selector: Element,
  xdata: number[],
  ydata: number[],
  options: {
    width?: number;
    height?: number;
    xmin?: number | 'auto';
    xmax?: number | 'auto';
    ymin?: number | 'auto';
    ymax?: number | 'auto';
    xlabel?: string;
    ylabel?: string;
    xgrid?: number[] | 'auto';
    ygrid?: number[] | 'auto';
    xTickLabels?: string[] | 'auto';
    yTickLabels?: string[] | 'auto';
    topMargin?: number;
    rightMargin?: number;
    bottomMargin?: number;
    leftMargin?: number;
    radius?: number;
    labels?: Record<string, any>;
  },
) {
  options = {
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
    ...options,
  };

  const width = (options.width ?? 600) - (options.leftMargin ?? 70) - (options.rightMargin ?? 0);
  const height = (options.height ?? 600) - (options.topMargin ?? 10) - (options.bottomMargin ?? 55);

  const xmin = options.xmin === 'auto' ? window._(options.xgrid).min() : options.xmin;
  const xmax = options.xmax === 'auto' ? window._(options.xgrid).max() : options.xmax;
  const x = window.d3.scaleLinear().domain([xmin, xmax]).range([0, width]);

  const ymin = options.ymin === 'auto' ? window._(options.ygrid).min() : options.ymin;
  const ymax = options.ymax === 'auto' ? window._(options.ygrid).max() : options.ymax;
  const y = window.d3.scaleLinear().domain([ymin, ymax]).range([height, 0]);

  xdata = xdata.filter($.isNumeric);
  ydata = ydata.filter($.isNumeric);
  xdata = xdata.map(function (x) {
    return Math.max(xmin, Math.min(xmax, x));
  });
  ydata = ydata.map(function (y) {
    return Math.max(ymin, Math.min(ymax, y));
  });

  const xTickFormat =
    options.xTickLabels === 'auto'
      ? null
      : function (d: null, i: number) {
          return options.xTickLabels ? options.xTickLabels[i] : null;
        };

  const xAxis = window.d3.axisBottom().scale(x).tickValues(options.xgrid).tickFormat(xTickFormat);

  const yTickFormat =
    options.yTickLabels === 'auto'
      ? null
      : function (d: null, i: number) {
          return options.yTickLabels ? options.yTickLabels[i] : null;
        };
  const yAxis = window.d3.axisLeft().scale(y).tickValues(options.ygrid).tickFormat(yTickFormat);

  const xGrid = window.d3
    .axisBottom()
    .scale(x)
    .tickValues(options.xgrid)
    .tickSize(-height)
    .tickFormat('');

  const yGrid = window.d3
    .axisLeft()
    .scale(y)
    .tickValues(options.ygrid)
    .tickSize(-width)
    .tickFormat('');

  const svg = window.d3
    .select($(selector).get(0))
    .append('svg')
    .attr('width', width + (options.leftMargin ?? 70) + (options.rightMargin ?? 20))
    .attr('height', height + (options.topMargin ?? 10) + (options.bottomMargin ?? 55))
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
  const pData = window.d3.zip(xdata, ydata, options.labels);

  const nodes = svg.selectAll('.point').data(pData).enter().append('g');

  nodes
    .append('circle')
    .attr('class', 'point')
    .attr('cx', function (p: number[]) {
      return x(p[0]);
    })
    .attr('cy', function (p: number[]) {
      return y(p[1]);
    })
    .attr('r', function () {
      return options.radius;
    });

  nodes
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('class', 'pointLabel')
    .attr('x', function (p: (number | string)[]) {
      return x(p[0]);
    })
    .attr('y', function (p: (number | string)[]) {
      return y(p[1]) - 6;
    })
    .text(function (p: (number | string)[]) {
      return p[2];
    });
}

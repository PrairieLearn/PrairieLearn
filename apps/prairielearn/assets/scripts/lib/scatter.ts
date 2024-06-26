import { scaleLinear, axisBottom, axisLeft, select, zip } from 'd3';

export function scatter(
  selector: HTMLElement,
  xdata?: number[],
  ydata?: number[],
  options?: {
    width?: number;
    height?: number;
    xmin?: number;
    xmax?: number;
    ymin?: number;
    ymax?: number;
    xlabel?: string;
    ylabel?: string;
    xgrid?: number[];
    ygrid?: number[];
    xTickLabels?: string[] | 'auto';
    yTickLabels?: string[] | 'auto';
    topMargin?: number;
    rightMargin?: number;
    bottomMargin?: number;
    leftMargin?: number;
    radius?: number;
    labels?: [];
  },
) {
  if (xdata === undefined) xdata = JSON.parse(selector.dataset.xdata ?? '[]');
  if (ydata === undefined) ydata = JSON.parse(selector.dataset.ydata ?? '[]');
  if (options === undefined) options = JSON.parse(selector.dataset.options ?? '[]');
  if (!xdata || !ydata) return;

  const resolvedOptions = {
    width: 600,
    height: 600,
    xmin: null,
    xmax: null,
    ymin: null,
    ymax: null,
    xlabel: 'value',
    ylabel: 'count',
    xgrid: [],
    ygrid: [],
    xTickLabels: 'auto',
    yTickLabels: 'auto',
    topMargin: 10,
    rightMargin: 20,
    bottomMargin: 55,
    leftMargin: 70,
    radius: 2,
    labels: [],
    ...options,
  };

  const width =
    (resolvedOptions.width ?? 600) -
    (resolvedOptions.leftMargin ?? 70) -
    (resolvedOptions.rightMargin ?? 0);
  const height =
    (resolvedOptions.height ?? 600) -
    (resolvedOptions.topMargin ?? 10) -
    (resolvedOptions.bottomMargin ?? 55);

  const xmin =
    resolvedOptions.xmin === null ? Math.min(...resolvedOptions.xgrid) : resolvedOptions.xmin;
  const xmax =
    resolvedOptions.xmax === null ? Math.max(...resolvedOptions.xgrid) : resolvedOptions.xmax;
  const x = scaleLinear().domain([xmin, xmax]).range([0, width]);

  const ymin =
    resolvedOptions.ymin === null ? Math.min(...resolvedOptions.ygrid) : resolvedOptions.ymin;
  const ymax =
    resolvedOptions.ymax === null ? Math.max(...resolvedOptions.ygrid) : resolvedOptions.ymax;
  const y = scaleLinear().domain([ymin, ymax]).range([height, 0]);

  xdata = xdata.filter((x) => typeof x === 'number');
  ydata = ydata.filter((y) => typeof y === 'number');
  xdata = xdata.map((x) => Math.max(xmin, Math.min(xmax, x)));
  ydata = ydata.map((y) => Math.max(ymin, Math.min(ymax, y)));

  let xAxis = axisBottom(x).tickValues(resolvedOptions.xgrid);
  if (resolvedOptions.xTickLabels !== 'auto') {
    xAxis = xAxis.tickFormat((d, i) => resolvedOptions.xTickLabels[i]);
  }

  let yAxis = axisLeft(y).tickValues(resolvedOptions.ygrid);
  if (resolvedOptions.yTickLabels !== 'auto') {
    yAxis = yAxis.tickFormat((d, i) => resolvedOptions.yTickLabels[i]);
  }

  const xGrid = axisBottom(x)
    .tickValues(resolvedOptions.xgrid)
    .tickSize(-height)
    .tickFormat(() => '');

  const yGrid = axisLeft(y)
    .tickValues(resolvedOptions.ygrid)
    .tickSize(-width)
    .tickFormat(() => '');

  const svg = select(selector)
    .append('svg')
    .attr('width', width + (resolvedOptions.leftMargin ?? 70) + (resolvedOptions.rightMargin ?? 20))
    .attr(
      'height',
      height + (resolvedOptions.topMargin ?? 10) + (resolvedOptions.bottomMargin ?? 55),
    )
    .attr('class', 'center-block statsPlot')
    .append('g')
    .attr('transform', `translate(${resolvedOptions.leftMargin},${resolvedOptions.topMargin})`);

  svg.append('g').attr('class', 'x grid').attr('transform', `translate(0,${height})`).call(xGrid);

  svg.append('g').attr('class', 'y grid').call(yGrid);

  svg
    .append('g')
    .attr('class', 'x axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .append('text')
    .attr('class', 'label')
    .attr('x', width / 2)
    .attr('y', '3em')
    .style('text-anchor', 'middle')
    .text(resolvedOptions.xlabel);

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
    .text(resolvedOptions.ylabel);

  // zips the data used to create the scatter plot
  // each data point has value [x, y, label]
  // if options.labels is not specified, then each data point will have an undefined label, and no labels will appear in the plot
  let pData = zip(xdata, ydata, resolvedOptions.labels);

  // if the number of labels is not equal to the number of data points, not all the data points will render. In this case, we zip the data points together without labels to preserve data.
  if (
    resolvedOptions.labels.length !== xdata.length ||
    resolvedOptions.labels.length !== ydata.length
  ) {
    pData = zip(xdata, ydata);
  }

  const nodes = svg.selectAll('.point').data(pData).enter().append('g');

  nodes
    .append('circle')
    .attr('class', 'point')
    .attr('cx', (p) => x(p[0]))
    .attr('cy', (p) => y(p[1]))
    .attr('r', () => resolvedOptions.radius);

  nodes
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('class', 'pointLabel')
    .attr('x', (p) => x(p[0]))
    .attr('y', (p) => y(p[1]) - 6)
    .text((p) => p[2]);
}

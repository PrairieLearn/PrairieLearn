import { scaleLinear, axisBottom, axisLeft, select } from 'd3';

export function histogram(
  selector: HTMLElement,
  data?: number[],
  xgrid?: number[],
  options?: {
    width?: number;
    height?: number;
    xmin?: number | 'auto';
    xmax?: number | 'auto';
    ymin?: number | 'auto';
    ymax?: number | 'auto';
    xlabel?: string;
    ylabel?: string;
    xTickLabels?: string[] | 'auto';
    topMargin?: number;
    rightMargin?: number;
    bottomMargin?: number;
    leftMargin?: number;
  },
) {
  if (data === undefined) data = JSON.parse(selector.dataset.histogram ?? '[]');
  if (xgrid === undefined) xgrid = JSON.parse(selector.dataset.xgrid ?? '[]');
  if (options === undefined) options = JSON.parse(selector.dataset.options ?? '{}');
  if (!data || !xgrid) return;

  const resolvedOptions = {
    width: 600,
    height: 371,
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
    ...options,
  };

  const width = resolvedOptions.width - resolvedOptions.leftMargin - resolvedOptions.rightMargin;
  const height = resolvedOptions.height - resolvedOptions.topMargin - resolvedOptions.bottomMargin;

  const xmin = resolvedOptions.xmin === 'auto' ? Math.min(...xgrid) : resolvedOptions.xmin;
  const xmax = resolvedOptions.xmax === 'auto' ? Math.max(...xgrid) : resolvedOptions.xmax;
  if (typeof xmin !== 'number' || typeof xmax !== 'number') {
    throw new Error('xmin and xmax must be numbers');
  }
  const x = scaleLinear().domain([xmin, xmax]).range([0, width]);

  const ymin = resolvedOptions.ymin === 'auto' ? Math.min(...data) : resolvedOptions.ymin;
  const ymax = resolvedOptions.ymax === 'auto' ? Math.max(...data) : resolvedOptions.ymax;
  if (typeof ymin !== 'number' || typeof ymax !== 'number') {
    throw new Error('xmin and xmax must be numbers');
  }
  const y = scaleLinear().domain([ymin, ymax]).nice().range([height, 0]);

  let xAxis = axisBottom(x).tickValues(xgrid);
  if (resolvedOptions.xTickLabels !== 'auto') {
    xAxis = xAxis.tickFormat((d, i) => resolvedOptions.xTickLabels[i]);
  }
  const yAxis = axisLeft(y);

  const xGrid = axisBottom(x)
    .tickValues(xgrid)
    .tickSize(-height)
    .tickFormat(() => '');

  const yGrid = axisLeft(y)
    .tickSize(-width)
    .tickFormat(() => '');

  const svg = select(selector)
    .append('svg')
    .attr('width', resolvedOptions.width)
    .attr('height', resolvedOptions.height)
    .attr('class', 'center-block statsPlot')
    .append('g')
    .attr('transform', `translate(${resolvedOptions.leftMargin},${resolvedOptions.topMargin})`);

  svg.append('g').attr('class', 'x grid').attr('transform', `translate(0,${height})`).call(xGrid);

  svg.append('g').attr('class', 'y grid').call(yGrid);

  svg
    .selectAll('.outlineBar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'outlineBar')
    .attr('x', (d, i) => x(xgrid[i]))
    .attr('y', (d) => y(d))
    .attr('width', (d, i) => x(xgrid[i + 1]) - x(xgrid[i]))
    .attr('height', (d) => y(0) - y(d));

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
}

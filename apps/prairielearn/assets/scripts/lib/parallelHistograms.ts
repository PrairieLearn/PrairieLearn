import { scaleLinear, scaleBand, axisBottom, axisLeft, range, select } from 'd3';

interface Data {
  label: string;
  histogram: number[];
  mean: number;
}

export function parallelHistograms(
  selector: HTMLElement,
  data?: Data[],
  options?: {
    width?: number;
    height?: number;
    xTickLabels?: string[] | 'auto';
    yTickLabels?: string[] | 'auto';
    xAxisHeight?: number;
    yAxisWidth?: number;
    xgrid?: number[];
    ygrid?: number[];
    xlabel?: string;
    ylabel?: string;
    topPadding?: number;
    rightPadding?: number;
  },
) {
  if (data === undefined) data = JSON.parse(selector.dataset.histograms ?? '[]');
  if (options === undefined) options = JSON.parse(selector.dataset.options ?? '{}');
  if (!data) return;

  const resolvedOptions = {
    width: 600,
    height: 370,
    xTickLabels: 'auto',
    yTickLabels: 'auto',
    yAxisWidth: 70,
    xAxisHeight: 70,
    topPadding: 15,
    rightPadding: 2,
    ...options,
  };

  const width = resolvedOptions.width;
  const height = resolvedOptions.height;

  const yTickLabels = resolvedOptions.yTickLabels;

  const yAxisWidth = resolvedOptions.yAxisWidth;
  const xAxisHeight = resolvedOptions.xAxisHeight;

  const topPadding = resolvedOptions.topPadding;
  const rightPadding = resolvedOptions.rightPadding;

  const totalWidth = width + yAxisWidth + rightPadding;
  const heightWithPadding = height + topPadding;
  const totalHeight = heightWithPadding + xAxisHeight;

  const numBuckets = data[0].histogram.length;
  const numHistograms = data.length;

  const yLinear = scaleLinear().domain([0, numBuckets]).range([0, height]);

  const xOrdinal = scaleBand()
    .domain(range(numHistograms).map((d) => `${d}`))
    .rangeRound([0, width])
    .padding(0.0);

  const xLinear = scaleLinear().domain([0, numHistograms]).range([0, width]);

  const plot = select(selector)
    .insert('svg', ':first-child')
    .attr('width', totalWidth)
    .attr('height', totalHeight)
    .attr('class', 'center-block statsPlot');

  const verticalGridLinear = axisBottom(xLinear)
    .tickSize(-height)
    .tickFormat(() => '');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(${yAxisWidth},${heightWithPadding})`)
    .call(verticalGridLinear);

  const verticalGridOrdinal = axisBottom(xOrdinal)
    .tickSize(-height)
    .tickFormat(() => '');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(${yAxisWidth},${heightWithPadding})`)
    .call(verticalGridOrdinal);

  const horizontalGrid = axisLeft(yLinear)
    .tickSize(-width)
    .tickFormat(() => '');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', () => `translate(${yAxisWidth},${topPadding})`)
    .call(horizontalGrid);

  const max = calculate_max(data);

  const width_per_day = width / numHistograms;
  const height_per_bucket = height / numBuckets;

  for (let index = 0; index < data.length; index++) {
    const histogram = data[index].histogram;
    const mean = data[index].mean;

    const widthForBucketFunction = function (i: number) {
      return (histogram[i] / max) * width_per_day;
    };

    const xOffset = (index + 0.5) * width_per_day + (yAxisWidth ?? 70);

    const g = plot.append('g').attr('transform', `translate(${xOffset}, 0)`);

    g.selectAll('.bar')
      .data(histogram)
      .enter()
      .append('rect')
      .attr('class', 'outlineBar')
      .attr('x', (d, i) => widthForBucketFunction(i) * -0.5)
      .attr('y', (d, i) => heightWithPadding - yLinear(i + 1))
      .attr('width', (d, i) => widthForBucketFunction(i))
      .attr('height', () => height_per_bucket);

    g.append('line')
      .attr('class', 'parallelHistMean')
      .attr('x1', () => -width_per_day / 2)
      .attr('x2', () => width_per_day / 2)
      .attr('y1', () => heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets))
      .attr('y2', () => heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets));
  }

  const yAxis = axisLeft(yLinear).tickFormat((d, i) => yTickLabels[i] ?? '');

  plot
    .append('g')
    .attr('class', 'y axis')
    .attr('transform', () => `translate(${yAxisWidth},${topPadding})`)
    .call(yAxis)
    .append('text')
    .attr('class', 'label')
    .text(resolvedOptions.ylabel ?? '');

  // it's rotated, so x means y, and y means x
  plot
    .selectAll('text.label')
    .attr('y', -50)
    .attr('x', (-1 * heightWithPadding) / 2)
    .attr('dy', '.35em')
    .attr('transform', 'rotate(-90)')
    .style('text-anchor', 'start');

  const xAxis = axisBottom(xOrdinal)
    .tickFormat((d, i) => data[i].label)
    .ticks(10);

  plot
    .append('g')
    .attr('class', 'x axis')
    .attr('transform', () => `translate(${yAxisWidth},${heightWithPadding})`)
    .attr('height', xAxisHeight)
    .call(xAxis)
    .append('text')
    .attr('class', 'label')
    .attr('x', width / 2)
    .attr('y', '3em')
    .style('text-anchor', 'middle')
    .text(resolvedOptions.xlabel ?? '');
}

function calculate_max(data: Data[]) {
  let max = 0;
  for (const row of data) {
    const histogram = row.histogram;
    const max_value = Math.max(...histogram);
    if (max_value > max) {
      max = max_value;
    }
  }

  max = max * 1.1;
  return max;
}

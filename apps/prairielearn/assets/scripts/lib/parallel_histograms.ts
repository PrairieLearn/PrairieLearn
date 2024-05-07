declare global {
  interface Window {
    _: any;
    d3: any;
  }
}

interface Data {
  label: string;
  histogram: number[];
  mean: number;
}

export function parallel_histograms(
  selector: Element,
  data: Data[],
  options: {
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
  options = {
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

  const width: number = options.width ?? 600;
  const height = options.height ?? 370;

  const yTickLabels = options.yTickLabels;

  const yAxisWidth = options.yAxisWidth;
  const xAxisHeight = options.xAxisHeight;

  const topPadding = options.topPadding;
  const rightPadding = options.rightPadding;

  const totalWidth = width + (yAxisWidth ?? 70) + (rightPadding ?? 2);
  const heightWithPadding = height + (topPadding ?? 15);
  const totalHeight = heightWithPadding + (xAxisHeight ?? 70);

  const numBuckets = data[0].histogram.length;
  const numDays = data.length;

  const yLinear = window.d3.scaleLinear().domain([0, numBuckets]).range([0, height]);

  const xOrdinal = window.d3
    .scaleBand()
    .domain(window.d3.range(numDays))
    .rangeRound([0, width])
    .padding(0.0);

  const xLinear = window.d3.scaleLinear().domain([0, numDays]).range([0, width]);

  const plot = window.d3
    .select($(selector).get(0))
    .insert('svg', ':first-child')
    .attr('width', totalWidth)
    .attr('height', totalHeight)
    .attr('class', 'center-block statsPlot');

  const verticalGridLinear = window.d3.axisBottom().scale(xLinear).tickSize(-height).tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', 'translate(' + yAxisWidth + ',' + heightWithPadding + ')')
    .call(verticalGridLinear);

  const verticalGridOrdinal = window.d3
    .axisBottom()
    .scale(xOrdinal)
    .tickSize(-height)
    .tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', 'translate(' + yAxisWidth + ',' + heightWithPadding + ')')
    .call(verticalGridOrdinal);

  const horizontalGrid = window.d3.axisLeft().scale(yLinear).tickSize(-width).tickFormat('');

  plot
    .append('g')
    .attr('class', 'grid')
    .attr('transform', function () {
      return 'translate(' + yAxisWidth + ',' + topPadding + ')';
    })
    .call(horizontalGrid);

  const max = calculate_max(data);

  const width_per_day = width / numDays;
  const height_per_bucket = height / numBuckets;

  for (let index = 0; index < data.length; index++) {
    const histogram = data[index].histogram;
    const mean = data[index].mean;

    const widthForBucketFunction = function (i: number) {
      return (histogram[i] / max) * width_per_day;
    };

    const xOffset = (index + 0.5) * width_per_day + (yAxisWidth ?? 70);

    const g = plot.append('g').attr('transform', 'translate(' + xOffset + ', 0)');

    g.selectAll('.bar')
      .data(histogram)
      .enter()
      .append('rect')
      .attr('class', 'outlineBar')
      .attr('x', function (d: null, i: number) {
        return widthForBucketFunction(i) * -0.5;
      })
      .attr('y', function (d: null, i: number) {
        return heightWithPadding - yLinear(i + 1);
      })
      .attr('width', function (d: null, i: number) {
        return widthForBucketFunction(i);
      })
      .attr('height', function () {
        return height_per_bucket;
      });

    g.append('line')
      .attr('class', 'parallelHistMean')
      .attr('x1', function () {
        return -width_per_day / 2;
      })
      .attr('x2', function () {
        return width_per_day / 2;
      })
      .attr('y1', function () {
        return heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets);
      })
      .attr('y2', function () {
        return heightWithPadding - yLinear((Math.min(100, mean) / 100) * numBuckets);
      });
  }

  const yAxis = window.d3
    .axisLeft()
    .tickFormat(function (d: null, i: number) {
      return yTickLabels ? yTickLabels[i] : null;
    })
    .scale(yLinear);

  plot
    .append('g')
    .attr('class', 'y axis')
    .attr('transform', function () {
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
    x2: width + (yAxisWidth ?? 70),
    y2: topPadding,
    class: 'x axis',
  });

  plot.append('line').attr({
    x1: width + (yAxisWidth ?? 70),
    y1: topPadding,
    x2: width + (yAxisWidth ?? 70),
    y2: heightWithPadding,
    class: 'y axis',
  });

  const xAxis = window.d3
    .axisBottom()
    .scale(xOrdinal)
    .tickFormat(function (d: null, i: number) {
      return data[i].label;
    })
    .ticks(10);

  plot
    .append('g')
    .attr('class', 'x axis')
    .attr('transform', function () {
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

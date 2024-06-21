import * as d3 from 'd3';

export function histmini(
  selector: HTMLElement,
  data?: number[],
  options?: {
    width?: number;
    height?: number;
    xmin?: number;
    xmax?: number;
    ymin?: number | 'auto';
    ymax?: number | 'auto';
    normalize?: boolean;
  },
) {
  if (data === undefined) data = JSON.parse(selector.dataset.data ?? '[]');
  if (options === undefined) options = JSON.parse(selector.dataset.options ?? '{}');

  if (!Array.isArray(data) || data.length === 0) return;

  const resolvedOptions = {
    width: 100,
    height: 40,
    xmin: 0,
    xmax: 100,
    ymin: 0,
    ymax: 'auto' as const,
    normalize: false,
    ...options,
  };

  if (resolvedOptions.normalize) {
    const total = data.reduce((sum, value) => sum + value);
    data = data.map((val) => (total ? val / total : 0));
  }

  const margin = { top: 1, right: 1, bottom: 1, left: 1 },
    width = resolvedOptions.width - margin.left - margin.right,
    height = resolvedOptions.height - margin.top - margin.bottom;

  const x = d3
    .scaleBand()
    .domain(d3.range(data.length).map((n) => n.toString()))
    .rangeRound([0, width])
    .padding(0.2);

  const ymin = resolvedOptions.ymin === 'auto' ? Math.min(...data) : resolvedOptions.ymin;
  const ymax = resolvedOptions.ymax === 'auto' ? Math.max(...data) : resolvedOptions.ymax;
  const y = d3.scaleLinear().domain([ymin, ymax]).range([height, 0]);

  d3.scaleOrdinal(d3.schemeCategory10);

  const svg = d3
    .select(selector)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .attr('class', 'center-block statsPlot')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  svg
    .selectAll('.bar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', (_d, i) => x(i.toString()) ?? null)
    .attr('y', (d) => y(d))
    .attr('width', () => x.bandwidth())
    .attr('height', (d) => y(0) - y(d));

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

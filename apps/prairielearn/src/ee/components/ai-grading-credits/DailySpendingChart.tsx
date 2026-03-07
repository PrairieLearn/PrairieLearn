// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- echarts ships `export = echarts` types but ESM runtime; `import *` works at runtime via esbuild
import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

export function DailySpendingChart({
  data,
}: {
  data: { date: Date; spending_milli_dollars: number }[];
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const dates = data.map((d) => new Date(d.date).toISOString().slice(0, 10));
    const values = data.map((d) => d.spending_milli_dollars);

    chart.setOption({
      grid: { top: 10, right: 10, bottom: 30, left: 60 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: { value: number; name: string }[]) => {
          const p = params[0];
          const d = new Date(p.name + 'T00:00:00');
          const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return `${dateStr}<br/>${formatMilliDollars(p.value)}`;
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          fontSize: 10,
          formatter: (val: string) => {
            const d = new Date(val + 'T00:00:00');
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          formatter: (v: number) => formatMilliDollars(v),
        },
        min: 0,
      },
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: { color: '#5470c6' },
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data]);

  if (data.length === 0) return null;

  return <div ref={chartRef} style={{ height: '200px', width: '100%' }} />;
}

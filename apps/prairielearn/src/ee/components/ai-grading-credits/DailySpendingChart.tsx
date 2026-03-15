// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- echarts ships `export = echarts` types but ESM runtime; `import *` works at runtime via esbuild
import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

export type GroupByOption = 'none' | 'user' | 'assessment' | 'question';

export function DailySpendingChart({
  data,
  groupedData,
}: {
  data: { date: Date; spending_milli_dollars: number }[];
  groupedData?: { date: Date; group_label: string; spending_milli_dollars: number }[];
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const bootstrapFont =
      getComputedStyle(document.documentElement).getPropertyValue('--bs-body-font-family') ||
      'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

    const dates = data.map((d) => new Date(d.date).toISOString().slice(0, 10));

    const xAxis = {
      type: 'category' as const,
      data: dates,
      axisLabel: {
        fontSize: 10,
        formatter: (val: string) => {
          const d = new Date(val + 'T00:00:00');
          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },
      },
    };

    const yAxis = {
      type: 'value' as const,
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => formatMilliDollars(v),
      },
      min: 0,
      max: (value: { max: number }) => Math.max(100, value.max),
    };

    if (groupedData && groupedData.length > 0) {
      const uniqueGroups = [...new Set(groupedData.map((d) => d.group_label))];

      const lookup = new Map<string, number>();
      for (const d of groupedData) {
        const key = `${new Date(d.date).toISOString().slice(0, 10)}|${d.group_label}`;
        lookup.set(key, (lookup.get(key) ?? 0) + d.spending_milli_dollars);
      }

      const series = uniqueGroups.map((group) => ({
        name: group,
        type: 'bar' as const,
        stack: 'total',
        data: dates.map((date) => lookup.get(`${date}|${group}`) ?? 0),
      }));

      chart.setOption({
        textStyle: { fontFamily: bootstrapFont },
        grid: { top: 40, right: 10, bottom: 30, left: 60 },
        legend: {
          show: true,
          type: 'scroll',
          top: 0,
          formatter: (name: string) => {
            const parts = name.split('\n');
            if (parts.length === 1) return name;
            return `{title|${parts[0]}}\n{subtitle|${parts[1]}}`;
          },
          textStyle: {
            rich: {
              title: { fontSize: 12, lineHeight: 16 },
              subtitle: { fontSize: 10, color: '#999', lineHeight: 14 },
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: { value: number; name: string; marker: string; seriesName: string }[],
          ) => {
            const d = new Date(params[0].name + 'T00:00:00');
            const dateStr = d.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            let result = `${dateStr}<div style="margin:4px 0;border-top:1px solid rgba(255,255,255,0.3)"></div>`;
            const nonZero = params.filter((p) => p.value > 0);
            if (nonZero.length === 0) {
              result += `Credits used: $0.00`;
            } else {
              for (const p of nonZero) {
                const displayName = p.seriesName.split('\n')[0];
                result += `${p.marker} ${displayName}: ${formatMilliDollars(p.value)}<br/>`;
              }
            }
            return result;
          },
        },
        xAxis,
        yAxis,
        series,
      });
    } else {
      const values = data.map((d) => d.spending_milli_dollars);

      chart.setOption({
        textStyle: { fontFamily: bootstrapFont },
        grid: { top: 10, right: 10, bottom: 30, left: 60 },
        tooltip: {
          trigger: 'axis',
          formatter: (params: { value: number; name: string }[]) => {
            const p = params[0];
            const d = new Date(p.name + 'T00:00:00');
            const dateStr = d.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            return `${dateStr}<div style="margin:4px 0;border-top:1px solid rgba(255,255,255,0.3)"></div>Credits used: ${formatMilliDollars(p.value ?? 0)}`;
          },
        },
        xAxis,
        yAxis,
        series: [
          {
            type: 'bar',
            data: values,
            itemStyle: { color: '#5470c6' },
          },
        ],
      });
    }

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, groupedData]);

  if (data.length === 0) return null;

  return <div ref={chartRef} style={{ height: '200px', width: '100%' }} />;
}

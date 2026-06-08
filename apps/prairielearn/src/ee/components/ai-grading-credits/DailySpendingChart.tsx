import type { XAXisComponentOption, YAXisComponentOption } from 'echarts';

import { type HtmlSafeString, html, unsafeHtml } from '@prairielearn/html';

import { EChart, axisTooltipFormatter } from '../../../components/EChart.js';
import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

export type GroupByOption = 'none' | 'user' | 'assessment' | 'question';

export function DailySpendingChart({
  data,
  groupedData,
}: {
  data: { date: Date; spending_milli_dollars: number }[];
  groupedData?: { date: Date; group_label: string; spending_milli_dollars: number }[];
}) {
  if (data.length === 0) return null;

  const bootstrapFont =
    // eslint-disable-next-line @eslint-react/purity -- reading a stable CSS variable, not a side effect
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

  const option =
    groupedData && groupedData.length > 0
      ? buildGroupedOption({ dates, groupedData, bootstrapFont, xAxis, yAxis })
      : buildSimpleOption({ data, bootstrapFont, xAxis, yAxis });

  return <EChart option={option} style={{ height: '200px', width: '100%' }} notMerge />;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function tooltipDivider(): HtmlSafeString {
  return html`<div style="margin:4px 0;border-top:1px solid rgba(255,255,255,0.3)"></div>`;
}

function buildGroupedOption({
  dates,
  groupedData,
  bootstrapFont,
  xAxis,
  yAxis,
}: {
  dates: string[];
  groupedData: { date: Date; group_label: string; spending_milli_dollars: number }[];
  bootstrapFont: string;
  xAxis: XAXisComponentOption;
  yAxis: YAXisComponentOption;
}) {
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

  return {
    textStyle: { fontFamily: bootstrapFont },
    grid: { top: 40, right: 10, bottom: 30, left: 60 },
    legend: {
      show: true,
      type: 'scroll' as const,
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
      trigger: 'axis' as const,
      formatter: axisTooltipFormatter((params) => {
        const nonZero = params.filter((p) => p.value > 0);
        const lines =
          nonZero.length === 0
            ? html`Credits used: $0.00`
            : nonZero.map((p) => {
                const displayName = p.seriesName?.split('\n')[0];
                const amount = formatMilliDollars(p.value);
                return html`${unsafeHtml(p.marker)} ${displayName}: ${amount}<br />`;
              });
        return html`${formatDate(params[0].name)}${tooltipDivider()}${lines}`.toString();
      }),
    },
    xAxis,
    yAxis,
    series,
  };
}

function buildSimpleOption({
  data,
  bootstrapFont,
  xAxis,
  yAxis,
}: {
  data: { spending_milli_dollars: number }[];
  bootstrapFont: string;
  xAxis: XAXisComponentOption;
  yAxis: YAXisComponentOption;
}) {
  return {
    textStyle: { fontFamily: bootstrapFont },
    grid: { top: 10, right: 10, bottom: 30, left: 60 },
    legend: { show: false },
    tooltip: {
      trigger: 'axis' as const,
      formatter: axisTooltipFormatter((params) => {
        const p = params[0];
        const label = `Credits used: ${formatMilliDollars(p.value)}`;
        return html`${formatDate(p.name)}${tooltipDivider()}${label}`.toString();
      }),
    },
    xAxis,
    yAxis,
    series: [
      {
        type: 'bar' as const,
        data: data.map((d) => d.spending_milli_dollars),
        itemStyle: { color: '#5470c6' },
      },
    ],
  };
}

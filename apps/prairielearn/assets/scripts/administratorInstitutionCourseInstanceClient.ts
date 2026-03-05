// @ts-expect-error -- echarts ships `export = echarts` types but ESM runtime; `import *` works at runtime via esbuild
import * as echarts from 'echarts';

import { onDocumentReady } from '@prairielearn/browser-utils';

function formatMilliDollars(milliDollars: number): string {
  if (milliDollars > 0 && milliDollars < 10) {
    return 'less than $0.01';
  }
  const dollars = milliDollars / 1000;
  return `$${dollars.toFixed(2)}`;
}

onDocumentReady(() => {
  document.querySelectorAll('.js-plan').forEach((plan) => {
    const enabledCheckbox = plan.querySelector<HTMLInputElement>('.js-plan-enabled');
    const enabledType = plan.querySelector<HTMLSelectElement>('.js-plan-type');

    if (!enabledCheckbox || !enabledType) return;

    enabledCheckbox.addEventListener('change', () => {
      enabledType.disabled = !enabledCheckbox.checked;
    });
  });

  const chartEl = document.querySelector<HTMLElement>('.js-balance-chart');
  if (chartEl?.dataset.chartData) {
    const data: [string, number][] = JSON.parse(chartEl.dataset.chartData);
    const chart = echarts.init(chartEl);

    chart.setOption({
      grid: { top: 10, right: 10, bottom: 30, left: 60 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: { value: [string, number] }[]) => {
          const p = params[0];
          const d = new Date(p.value[0]);
          return `${d.toLocaleString()}<br/>${formatMilliDollars(p.value[1])}`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 10 },
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
          type: 'line',
          data,
          smooth: false,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.1 },
        },
      ],
    });

    window.addEventListener('resize', () => chart.resize());
  }
});

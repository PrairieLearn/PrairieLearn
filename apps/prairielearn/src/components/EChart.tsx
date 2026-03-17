import type { TooltipComponentFormatterCallbackParams } from 'echarts';
import * as echarts from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { useEffect, useRef } from 'react';

type AxisTooltipParam = Omit<CallbackDataParams, 'value' | 'marker'> & {
  value: number;
  marker: string;
};

/**
 * Creates a tooltip formatter for `trigger: 'axis'` tooltips. Narrows the
 * params union to always be an array and treats `value` as `number` and
 * `marker` as `string`, which is always the case for numeric bar/line charts.
 */
export function axisTooltipFormatter(
  fn: (params: AxisTooltipParam[]) => string,
): (params: TooltipComponentFormatterCallbackParams) => string {
  return (raw) => fn((Array.isArray(raw) ? raw : [raw]) as AxisTooltipParam[]);
}

export function EChart({
  option,
  style,
  renderer = 'canvas',
  notMerge = false,
}: {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  renderer?: 'canvas' | 'svg';
  notMerge?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, { renderer });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Only re-create the chart instance if the renderer changes.
  }, [renderer]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge });
  }, [option, notMerge]);

  return <div ref={containerRef} style={style} />;
}

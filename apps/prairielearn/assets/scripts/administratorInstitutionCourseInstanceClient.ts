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

  const spendingChartEl = document.querySelector<HTMLElement>('.js-spending-chart');
  if (spendingChartEl?.dataset.chartData) {
    const data: [string, number][] = JSON.parse(spendingChartEl.dataset.chartData);
    const chart = echarts.init(spendingChartEl);

    const dates = data.map((d) => d[0]);
    const values = data.map((d) => d[1]);

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

    window.addEventListener('resize', () => chart.resize());
  }

  const adjustForm = document.querySelector<HTMLFormElement>('.js-adjust-credits-form');
  if (adjustForm) {
    adjustForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const feedbackEl = adjustForm.parentElement?.querySelector('.js-adjust-feedback');
      const submitBtn = adjustForm.querySelector<HTMLButtonElement>('.js-adjust-submit');
      if (!submitBtn) return;

      const formData = new URLSearchParams();
      formData.set('__action', 'adjust_credit_pool');
      formData.set(
        '__csrf_token',
        adjustForm.querySelector<HTMLInputElement>('input[name="__csrf_token"]')?.value ?? '',
      );
      formData.set(
        'adjustment_action',
        adjustForm.querySelector<HTMLSelectElement>('#adjustment_action')?.value ?? '',
      );
      formData.set(
        'amount_dollars',
        adjustForm.querySelector<HTMLInputElement>('#amount_dollars')?.value ?? '',
      );
      formData.set(
        'credit_type',
        adjustForm.querySelector<HTMLSelectElement>('#credit_type')?.value ?? '',
      );

      submitBtn.disabled = true;
      submitBtn.textContent = 'Applying...';
      if (feedbackEl) feedbackEl.innerHTML = '';

      try {
        const res = await fetch(window.location.pathname, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'fetch',
          },
          body: formData.toString(),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }

        const pool: {
          credit_transferable_milli_dollars: number;
          credit_non_transferable_milli_dollars: number;
          total_milli_dollars: number;
        } = await res.json();

        const totalEl = document.querySelector('.js-balance-total');
        const transferableEl = document.querySelector('.js-balance-transferable');
        const nonTransferableEl = document.querySelector('.js-balance-non-transferable');

        if (totalEl) {
          totalEl.textContent = formatMilliDollars(pool.total_milli_dollars);
        }
        if (transferableEl) {
          transferableEl.textContent = formatMilliDollars(pool.credit_transferable_milli_dollars);
        }
        if (nonTransferableEl) {
          nonTransferableEl.textContent = formatMilliDollars(
            pool.credit_non_transferable_milli_dollars,
          );
        }

        if (feedbackEl) {
          feedbackEl.innerHTML =
            '<div class="alert alert-success alert-dismissible fade show py-2">' +
            'Credits updated successfully.' +
            '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
            '</div>';
        }

        const amountInput = adjustForm.querySelector<HTMLInputElement>('#amount_dollars');
        if (amountInput) amountInput.value = '';
      } catch (err) {
        if (feedbackEl) {
          const message = err instanceof Error ? err.message : 'An error occurred.';
          feedbackEl.innerHTML =
            '<div class="alert alert-danger alert-dismissible fade show py-2">' +
            message +
            '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
            '</div>';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Apply';
      }
    });
  }
});

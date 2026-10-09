import { renderMathInElement } from 'mathlive';
import { observe } from 'selector-observer';

import { CALCULATOR_PRESETS, CalculatorDrawer } from '../../src/components/CalculatorDrawer.js';
import { CalculatorTypeSchema } from '../../src/schemas/infoAssessment.js';

import { initCalculator } from './calculatorClient.js';

const cleanups = new WeakMap<HTMLElement, () => void>();

observe('[data-calculator-preview]', {
  constructor: HTMLElement,
  add(container) {
    let animationFrame = 0;
    const saveBar = document.querySelector('.pl-ui-sticky-save-bar');
    // The save bar can grow when its buttons wrap or it displays a status message.
    const resizeObserver = new ResizeObserver(() => {
      container.style.setProperty(
        '--calculator-preview-bottom',
        `${saveBar!.getBoundingClientRect().height}px`,
      );
    });
    if (saveBar) resizeObserver.observe(saveBar);

    function render() {
      cancelAnimationFrame(animationFrame);
      const previousDrawer = container.querySelector<HTMLElement>('#calculatorDrawer');
      const previousFab = container.querySelector<HTMLElement>('#calculatorFab');
      const type = CalculatorTypeSchema.parse(container.dataset.calculatorPreview);
      const template = document.createElement('template');
      template.innerHTML = CalculatorDrawer({
        storageKey: 'calculator-preview',
        features: CALCULATOR_PRESETS[type],
      }).toString();
      const drawer = template.content.querySelector<HTMLElement>('#calculatorDrawer')!;
      const fab = template.content.querySelector<HTMLElement>('#calculatorFab')!;
      const fabClose = template.content.querySelector<HTMLElement>('#calculatorFabClose');

      if (previousDrawer) {
        // Apply the existing state before insertion so a preset change never slides in again.
        drawer.classList.add('no-transition');
        drawer.classList.toggle('open', previousDrawer.classList.contains('open'));
        drawer.style.width = previousDrawer.style.width;
        fab.classList.toggle('visible', previousFab!.classList.contains('visible'));
      }
      container.replaceChildren(template.content);
      const mode = drawer.dataset.calculatorMode;
      // Each preset has temporary history, independent of student calculator data.
      const data = new Map<string, string>();
      const dispose = initCalculator(
        drawer.dataset.storageKey!,
        { drawer, fab, fabClose },
        mode === 'basic' || mode === 'scientific' ? mode : undefined,
        {
          getItem: (key) => data.get(key) ?? null,
          setItem: (key, value) => {
            data.set(key, value);
          },
          removeItem: (key) => {
            data.delete(key);
          },
        },
      );
      renderMathInElement(container, {
        TeX: { delimiters: { inline: [['$', '$']], display: [['$$', '$$']] } },
      });
      if (previousDrawer) {
        animationFrame = requestAnimationFrame(() => {
          animationFrame = requestAnimationFrame(() => drawer.classList.remove('no-transition'));
        });
      } else {
        fab.click();
      }
      return dispose;
    }

    let disposeCalculator = render();
    const observer = new MutationObserver(() => {
      disposeCalculator();
      disposeCalculator = render();
    });
    observer.observe(container, { attributes: true, attributeFilter: ['data-calculator-preview'] });
    cleanups.set(container, () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrame);
      disposeCalculator();
    });
  },
  remove(container) {
    cleanups.get(container)!();
    cleanups.delete(container);
  },
});

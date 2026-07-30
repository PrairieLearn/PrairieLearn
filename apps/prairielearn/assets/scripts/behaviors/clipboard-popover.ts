import { observe } from 'selector-observer';

observe('.js-copy-button[data-clipboard-text], .js-copy-button[data-clipboard-target]', {
  constructor: HTMLElement,
  add(button) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const { clipboardText, clipboardTarget } = button.dataset;

      let text: string;
      if (clipboardText) {
        text = clipboardText;
      } else if (clipboardTarget) {
        text = Array.from(document.querySelectorAll(clipboardTarget))
          .map((el) => el.textContent)
          .join('');
      } else {
        return;
      }

      void navigator.clipboard.writeText(text).then(() => {
        const tooltipInstance = window.bootstrap.Tooltip.getInstance(button);
        // If there is a tooltip instance, don't attempt to show the popover as it may interfere with the tooltip.
        if (tooltipInstance) {
          tooltipInstance.hide();
          return;
        }

        const popover = window.bootstrap.Popover.getOrCreateInstance(button, {
          title: '',
          content: 'Copied!',
          placement: 'bottom',
          trigger: 'manual',
        });
        popover.show();
        window.setTimeout(() => popover.hide(), 1000);
      });
    });
  },
});

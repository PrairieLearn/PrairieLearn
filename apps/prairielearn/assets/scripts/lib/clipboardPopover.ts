import { observe } from 'selector-observer';

observe('.js-copy-button[data-clipboard-text], .js-copy-button[data-clipboard-target]', {
  constructor: HTMLElement,
  add(button) {
    button.addEventListener('click', () => {
      const { clipboardText, clipboardTarget } = button.dataset;

      let text: string;
      if (clipboardText != null) {
        text = clipboardText;
      } else if (clipboardTarget) {
        text = Array.from(document.querySelectorAll(clipboardTarget))
          .map((el) => el.textContent ?? '')
          .join('');
      } else {
        return;
      }

      void navigator.clipboard.writeText(text).then(() => {
        const popover = window.bootstrap.Popover.getOrCreateInstance(button, {
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

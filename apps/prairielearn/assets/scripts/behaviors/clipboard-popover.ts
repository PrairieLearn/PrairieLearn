import { observe } from 'selector-observer';

let copyStatusElement: HTMLSpanElement | null = null;

function announceCopied() {
  copyStatusElement ??= document.createElement('span');
  const statusElement = copyStatusElement;
  if (!statusElement.isConnected) {
    statusElement.className = 'visually-hidden';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('aria-live', 'polite');
    statusElement.setAttribute('aria-atomic', 'true');
    document.body.append(statusElement);
  }

  statusElement.textContent = '';
  window.setTimeout(() => {
    statusElement.textContent = 'Copied.';
  }, 0);
}

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
        text = Array.from(document.querySelectorAll(clipboardTarget), (el) => el.textContent).join(
          '',
        );
      } else {
        return;
      }

      void navigator.clipboard.writeText(text).then(() => {
        announceCopied();
        const tooltipInstance = window.bootstrap.Tooltip.getInstance(button);
        // If there is a tooltip instance, don't attempt to show the popover as it may interfere with the tooltip.
        if (tooltipInstance) {
          tooltipInstance.hide();
          return;
        }

        // This transient copy confirmation is a status message, not a contextual
        // dialog managed by the shared popover behavior.
        button.dataset.plPopoverMode = 'status';
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

document.addEventListener('click', (e) => {
  const button = (e.target as Element).closest<HTMLElement>('.js-copy-button');
  if (!button) return;

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

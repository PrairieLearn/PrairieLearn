const iframe = document.querySelector<HTMLIFrameElement>('iframe')!;

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;

  const data = event.data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('type' in data) ||
    data.type !== 'pdf-preview' ||
    !('bytes' in data) ||
    !(data.bytes instanceof ArrayBuffer)
  ) {
    return;
  }

  // Create the blob here so it inherits this viewer's same-origin framing
  // policy rather than the question page's frame-ancestors 'none'.
  const url = URL.createObjectURL(new Blob([data.bytes], { type: 'application/pdf' }));
  iframe.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  iframe.src = url;
});

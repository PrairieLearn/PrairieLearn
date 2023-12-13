import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  if (document.getElementById('authn_provider_debug')) {
    const data = decodeData<string[]>('authn_provider_debug');

    //const target = document.getElementById('authn_provider_debug_target') as HTMLElement;
    //target.addEventListener('click', click3);

    const dbButton = document.getElementById('authn_provider_debug_toggle') as HTMLButtonElement;
    dbButton?.addEventListener(
      'click',
      () => {
        dbButton.insertAdjacentHTML(
          'afterend',
          `<br><code>${JSON.stringify(data, null, 2)}</code>`,
        );
      },
      { once: true },
    );
  }
});

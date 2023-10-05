import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const platformDefaults = decodeData('platform_defaults_data');

  const platformSelector = document.querySelector<HTMLSelectElement>('#choosePlatform');
  const updateParams = document.querySelector<HTMLInputElement>('#update_params');

  platformSelector.addEventListener('change', () => {
    if (!updateParams.checked || platformSelector.value === 'Unknown') {
      return;
    }

    const ip = document.querySelector<HTMLInputElement>('#issuer_params');

    const platform_default = platformDefaults.find(
      ({ platform }) => platform === platformSelector.value,
    );
    if (!platform_default) {
      return;
    }

    ip.value = JSON.stringify(platform_default.issuer_params, null, 2);
  });
});

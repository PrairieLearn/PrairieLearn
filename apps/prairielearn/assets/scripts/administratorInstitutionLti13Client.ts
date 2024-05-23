import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

import { type LTI13InstancePlatforms } from '../../src/ee/pages/administratorInstitutionLti13/administratorInstitutionLti13.types.js';

onDocumentReady(() => {
  const platformDefaults = decodeData<LTI13InstancePlatforms>('platform_defaults_data') || [];

  const platformSelector = document.querySelector<HTMLSelectElement>('#choosePlatform');
  const updateParams = document.querySelector<HTMLInputElement>('#update_params');

  if (!platformSelector || !updateParams) return;

  platformSelector.addEventListener('change', () => {
    if (!updateParams.checked || platformSelector.value === 'Unknown') {
      return;
    }

    const ip = document.querySelector<HTMLInputElement>('#issuer_params');
    const cf = document.querySelector<HTMLInputElement>('#custom_fields');

    if (!ip || !cf) return;

    const platform_default = platformDefaults.find(
      ({ platform }) => platform === platformSelector.value,
    );
    if (!platform_default) {
      return;
    }

    ip.value = JSON.stringify(platform_default.issuer_params, null, 2);
    cf.value = JSON.stringify(platform_default.custom_fields, null, 2);
  });
});

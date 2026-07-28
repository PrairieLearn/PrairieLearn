import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import { type LTI13InstancePlatforms } from '../../src/ee/pages/administratorInstitutionLti13/administratorInstitutionLti13.types.js';

onDocumentReady(() => {
  const setConfirmationRequirements = (
    container: HTMLElement | null | undefined,
    required: boolean,
  ) => {
    if (!container) return;
    container.hidden = !required;
    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((confirmation) => {
        confirmation.required = required;
      });
  };

  const configForm = document.querySelector<HTMLInputElement>(
    'input[name="__action"][value="save_pl_config"]',
  )?.form;
  const uinAttribute = configForm?.querySelector<HTMLInputElement>('input[name="uin_attribute"]');
  const uinConfirmationContainer = configForm?.querySelector<HTMLElement>(
    '[data-lti13-identity-confirmations]',
  );

  if (uinAttribute) {
    const updateUinConfirmationRequirements = () => {
      const uinConfigurationAvailable =
        uinAttribute.dataset.lti13UinConfigurationAvailable === 'true';
      const uinChanged =
        uinAttribute.value.trim() !== '' &&
        uinAttribute.value.trim() !== uinAttribute.defaultValue.trim();

      uinAttribute.setCustomValidity(
        !uinConfigurationAvailable && uinChanged
          ? 'Complete the institution SAML and single sign-on prerequisites before changing the LTI UIN attribute.'
          : '',
      );
      setConfirmationRequirements(
        uinConfirmationContainer,
        uinConfigurationAvailable && uinChanged,
      );
    };

    uinAttribute.addEventListener('input', updateUinConfirmationRequirements);
    updateUinConfirmationRequirements();
  }

  const platformDefaults = decodeData<LTI13InstancePlatforms>('platform_defaults_data');

  const platformSelector = document.querySelector<HTMLSelectElement>('#choosePlatform');
  const updateParams = document.querySelector<HTMLInputElement>('#update_params');
  const issuerParams = document.querySelector<HTMLTextAreaElement>('#issuer_params');
  const clientId = document.querySelector<HTMLInputElement>('#client_id');
  const customFields = document.querySelector<HTMLTextAreaElement>('#custom_fields');

  if (!platformSelector || !updateParams || !issuerParams || !clientId || !customFields) return;

  const platformForm = platformSelector.form;
  const platformConfirmationContainer = platformForm?.querySelector<HTMLElement>(
    '[data-lti13-platform-confirmations]',
  );

  const updatePlatformConfirmationRequirements = () => {
    const originalPlatform =
      platformSelector.querySelector<HTMLOptionElement>('option[selected]')?.value;
    const platformChanged =
      platformSelector.value !== originalPlatform ||
      issuerParams.value !== issuerParams.defaultValue ||
      clientId.value !== clientId.defaultValue ||
      customFields.value !== customFields.defaultValue;

    setConfirmationRequirements(platformConfirmationContainer, platformChanged);
  };

  platformSelector.addEventListener('change', () => {
    if (updateParams.checked && platformSelector.value !== 'Unknown') {
      const platformDefault = platformDefaults.find(
        ({ platform }) => platform === platformSelector.value,
      );
      if (platformDefault) {
        issuerParams.value = JSON.stringify(platformDefault.issuer_params, null, 2);
        customFields.value = JSON.stringify(platformDefault.custom_fields, null, 2);
      }
    }
    updatePlatformConfirmationRequirements();
  });

  if (platformForm) {
    platformForm.addEventListener('input', updatePlatformConfirmationRequirements);
    platformForm.addEventListener('reset', () => {
      requestAnimationFrame(updatePlatformConfirmationRequirements);
    });
  }
  updatePlatformConfirmationRequirements();
});

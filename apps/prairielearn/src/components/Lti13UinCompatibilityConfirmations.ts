import { html } from '@prairielearn/html';

import { LTI13_UIN_COMPATIBILITY_CONFIRMATION_FIELDS } from '../lib/institution-identity.js';

const CONFIRMATIONS = [
  [
    LTI13_UIN_COMPATIBILITY_CONFIRMATION_FIELDS.sameCanonicalUin,
    'I confirm that the SAML and LTI attributes represent the same canonical UIN.',
  ],
  [
    LTI13_UIN_COMPATIBILITY_CONFIRMATION_FIELDS.usersBackfilled,
    'I confirm that existing user records have been backfilled with compatible UINs.',
  ],
] as const;

export function Lti13UinCompatibilityConfirmations({
  idPrefix,
  description,
}: {
  idPrefix: string;
  description: string;
}) {
  return html`
    <fieldset class="border rounded p-3 mb-3">
      <legend class="float-none w-auto px-2 fs-6">LTI and SAML UIN compatibility</legend>
      <p>${description}</p>
      ${CONFIRMATIONS.map(([name, label], index) => {
        const id = `${idPrefix}-${index}`;
        return html`
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="${id}" name="${name}" value="1" />
            <label class="form-check-label" for="${id}">${label}</label>
          </div>
        `;
      })}
    </fieldset>
  `;
}

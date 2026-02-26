import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';

export const SamlTest = ({
  uid,
  uin,
  name,
  givenName,
  familyName,
  email,
  uidAttribute,
  uinAttribute,
  nameAttribute,
  givenNameAttribute,
  familyNameAttribute,
  emailAttribute,
  attributes,
  resLocals,
}: {
  uid: string | null;
  uin: string | null;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  uidAttribute: string | null;
  uinAttribute: string | null;
  nameAttribute: string | null;
  givenNameAttribute: string | null;
  familyNameAttribute: string | null;
  emailAttribute: string | null;
  attributes: Record<string, any>;
  resLocals: UntypedResLocals;
}) => {
  const hasUidAttribute = !!uidAttribute;
  const hasUinAttribute = !!uinAttribute;
  const hasNameAttribute = !!nameAttribute;
  const hasGivenNameAttribute = !!givenNameAttribute;
  const hasFamilyNameAttribute = !!familyNameAttribute;
  const hasNameMapping = hasNameAttribute || (hasGivenNameAttribute && hasFamilyNameAttribute);
  const hasEmailAttribute = !!emailAttribute;

  const hasUid = !!uid;
  const hasUin = !!uin;
  const hasName = !!name;
  const hasGivenName = !!givenName;
  const hasFamilyName = !!familyName;
  const hasEmail = !!email;

  // Note that even though the normal login flow doesn't yet validate the
  // presence of an email, we want to make it obvious during all future SAML
  // configuration processes that `emailAttribute` should be set and that the
  // corresponding value should be present.
  const hasError =
    !hasUidAttribute ||
    !hasUinAttribute ||
    !hasNameMapping ||
    !hasEmailAttribute ||
    !hasUid ||
    !hasUin ||
    !hasName ||
    !hasEmail;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'SAML test' })}
      </head>
      <body>
        <main id="content" class="container mb-4">
          ${hasError
            ? html`
                <div class="alert alert-danger">
                  <h2 class="h4">
                    One or more errors were encountered while validating the SAML response.
                  </h2>
                  <ul class="mb-0">
                    ${!hasUidAttribute
                      ? html`<li>No UID attribute mapping is configured for this institution</li>`
                      : ''}
                    ${!hasUinAttribute
                      ? html`<li>No UIN attribute mapping is configured for this institution</li>`
                      : ''}
                    ${!hasNameMapping
                      ? html`<li>No name attribute mapping is configured for this institution</li>`
                      : ''}
                    ${!hasEmailAttribute
                      ? html`<li>No email attribute mapping is configured for this institution</li>`
                      : ''}
                    ${hasUidAttribute && !hasUid
                      ? html`<li>
                          No value found for configured UID attribute (<code>${uidAttribute}</code>)
                        </li>`
                      : ''}
                    ${hasUinAttribute && !hasUin
                      ? html`<li>
                          No value found for configured UIN attribute (<code>${uinAttribute}</code>)
                        </li>`
                      : ''}
                    ${hasNameAttribute && !hasName
                      ? html`<li>
                          No value found for configured name attribute
                          (<code>${nameAttribute}</code>)
                        </li>`
                      : ''}
                    ${hasGivenNameAttribute && !hasGivenName
                      ? html`<li>
                          No value found for configured given name attribute
                          (<code>${givenNameAttribute}</code>)
                        </li>`
                      : ''}
                    ${hasFamilyNameAttribute && !hasFamilyName
                      ? html`<li>
                          No value found for configured family name attribute
                          (<code>${familyNameAttribute}</code>)
                        </li>`
                      : ''}
                    ${hasEmailAttribute && !hasEmail
                      ? html`<li>
                          No value found for configured email attribute
                          (<code>${emailAttribute}</code>)
                        </li>`
                      : ''}
                  </ul>
                </div>
              `
            : ''}
          ${hasUid || hasUin || hasName
            ? html`
                <h2 class="h4">Mapped SAML attributes</h2>
                <ul>
                  ${hasUid
                    ? html`<li><strong>UID:</strong> ${uid} (<code>${uidAttribute}</code>)</li>`
                    : ''}
                  ${hasUin
                    ? html`<li><strong>UIN:</strong> ${uin} (<code>${uinAttribute}</code>)</li>`
                    : ''}
                  ${hasName
                    ? html`<li>
                        <strong>Name:</strong> ${name}
                        ${hasGivenName && hasFamilyName
                          ? html`(<code>${givenNameAttribute}</code> +
                              <code>${familyNameAttribute}</code>)`
                          : html`(<code>${nameAttribute}</code>)`}
                      </li>`
                    : ''}
                  ${hasEmail
                    ? html`<li>
                        <strong>Email:</strong> ${email} (<code>${emailAttribute}</code>)
                      </li>`
                    : ''}
                </ul>
              `
            : ''}

          <h2 class="h4">All SAML attributes</h2>
          <pre><code>${JSON.stringify(attributes, null, 2)}</code></pre>
        </main>
      </body>
    </html>
  `.toString();
};

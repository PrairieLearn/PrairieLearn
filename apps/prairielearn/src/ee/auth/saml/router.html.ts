import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export const SamlTest = ({
  uid,
  uin,
  name,
  uidAttribute,
  uinAttribute,
  nameAttribute,
  attributes,
  resLocals,
}) => {
  const hasUidAttribute = !!uidAttribute;
  const hasUinAttribute = !!uinAttribute;
  const hasNameAttribute = !!nameAttribute;

  const hasUid = !!uid;
  const hasUin = !!uin;
  const hasName = !!name;

  const hasError =
    !hasUidAttribute || !hasUinAttribute || !hasNameAttribute || !hasUid || !hasUin || !hasName;

  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          pageTitle: 'SAML test',
        })}
      </head>
      <body>
        <main class="container mb-4">
          ${
            hasError
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
                      ${!hasNameAttribute
                        ? html`<li>
                            No name attribute mapping is configured for this institution
                          </li>`
                        : ''}
                      ${hasUidAttribute && !hasUid
                        ? html`<li>
                            No value fond for configured UID attribute
                            (<code>${uidAttribute}</code>)
                          </li>`
                        : ''}
                      ${hasUinAttribute && !hasUin
                        ? html`<li>
                            No value found for configured UIN attribute
                            (<code>${uinAttribute}</code>)
                          </li>`
                        : ''}
                      ${hasNameAttribute && !hasName
                        ? html`<li>
                            No value found for configured name attribute
                            (<code>${nameAttribute}</code>)
                          </li>`
                        : ''}
                    </ul>
                  </div>
                `
              : ''
          }

          ${
            hasUid || hasUin || hasName
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
                          <strong>Name:</strong> ${name} (<code>${nameAttribute}</code>)
                        </li>`
                      : ''}
                  </ul>
                `
              : ''
          }

          <h2 class="h4">All SAML attributes</h1>
          <pre><code>${JSON.stringify(attributes, null, 2)}</code></pre>
        </main>
      </body>
    </html>
  `.toString();
};

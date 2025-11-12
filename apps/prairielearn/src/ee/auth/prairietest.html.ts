import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';

export const AuthPrairieTest = ({ jwt, prairieTestCallback, resLocals }) => {
  return PageLayout({
    resLocals,
    pageTitle: 'PrairieTest Authentication',
    navContext: { type: 'public', page: 'prairietest_auth' },
    options: {
      enableNavbar: false,
      paddingBottom: false,
      paddingSides: false,
      enableEnhancedNav: false,
    },
    headContent: html`
      <style>
        .continue-card-container {
          width: 100%;
          max-width: 400px;
        }
      </style>
    `,
    content: html`
      <form id="form" action="${prairieTestCallback}" method="POST">
        <input type="hidden" name="jwt" value="${jwt}" />

        <div class="continue-card-container mx-auto">
          <div class="card continue-card m-3">
            <div class="card-body d-flex flex-column align-items-center">
              <div class="spinner-border mb-3" role="status">
                <span class="visually-hidden">Signing in...</span>
              </div>
              <h1 class="h4">PrairieTest authentication</h1>
              <p>Signing in to PrairieTest...</p>
              <button class="btn btn-success d-block w-100" type="submit" id="continue">
                Continue
              </button>
            </div>
          </div>
        </div>
      </form>
      <script>
        // If JavaScript is enabled, immediately disable the button. But if
        // it's disabled, the user can click the button to continue.
        const continueButton = document.getElementById('continue');
        continueButton.disabled = true;

        (() => {
          function submitForm() {
            const form = document.getElementById('form');
            form.submit();
          }

          if (document.readyState === 'interactive' || document.readyState === 'complete') {
            submitForm();
          } else {
            document.addEventListener('DOMContentLoaded', () => {
              submitForm();
            });
          }
        })();
      </script>
    `,
  });
};

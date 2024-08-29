import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';

export function AuthPassword({
  resLocals,
  passwordInvalid,
}: {
  resLocals: Record<string, any>;
  passwordInvalid: boolean;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          <h1 class="sr-only">Assessment Password</h1>
          <div class="card mb-4">
            <div class="card-body">
              <p class="text-center">A password is required to access this assessment.</p>

              ${passwordInvalid
                ? html`
                    <p class="text-center text-danger">
                      Previous password invalid or expired. Please try again.
                    </p>
                  `
                : ''}

              <form method="POST">
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <div class="form-group">
                  <label for="password">Password</label>
                  <input type="password" class="form-control" id="password" name="password" />
                </div>
                <button type="submit" class="btn btn-primary">Submit</button>
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

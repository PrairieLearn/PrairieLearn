import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';

export function AdministratorNetworks({ resLocals }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Exam-mode networks' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'networks' })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Exam-mode networks</h1>
            </div>
            <div class="table-responsive">
              <table
                class="table table-sm table-hover table-striped"
                aria-label="Exam-mode networks"
              >
                <thead>
                  <tr>
                    <th>CIDR</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Location</th>
                    <th>Purpose</th>
                  </tr>
                </thead>

                <tbody>
                  ${resLocals.networks.map(
                    (network) => html`
                      <tr>
                        <td>${network.network}</td>
                        <td>${network.start_date}</td>
                        <td>${network.end_date}</td>
                        <td>${network.location}</td>
                        <td>${network.purpose}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                To add new networks for exam-mode access, insert directly into the
                <strong><tt>exam_mode_networks</tt></strong> table.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

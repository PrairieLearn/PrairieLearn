import z from 'zod';

import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { ExamModeNetworkSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const AdministratorNetworksRowSchema = z.object({
  network: ExamModeNetworkSchema.shape.network,
  start_date: z.string(),
  end_date: z.string(),
  location: ExamModeNetworkSchema.shape.location,
  purpose: ExamModeNetworkSchema.shape.purpose,
});

type AdministratorNetworksRow = z.infer<typeof AdministratorNetworksRowSchema>;

export function AdministratorNetworks({
  resLocals,
  networks,
}: {
  resLocals: ResLocalsForPage<'plain'>;
  networks: AdministratorNetworksRow[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Exam-mode networks',
    navContext: {
      type: 'administrator',
      page: 'admin',
      subPage: 'networks',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>Exam-mode networks</h1>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Exam-mode networks">
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
              ${networks.map(
                (network: AdministratorNetworksRow) => html`
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
            <strong><code>exam_mode_networks</code></strong> table.
          </small>
        </div>
      </div>
    `,
  });
}

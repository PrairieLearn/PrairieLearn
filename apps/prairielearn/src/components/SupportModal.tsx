import { html } from '@prairielearn/html';

import { config } from '../lib/config.js';

import { Modal } from './Modal.js';

export function SupportModal() {
  return Modal({
    id: 'supportModal',
    title: 'Get help',
    size: 'modal-lg',
    form: false,
    body: html`
      <p>Get help with teaching in PrairieLearn.</p>
      <div class="row row-cols-1 row-cols-md-2 g-3">
        ${
          config.supportSlackUrl
            ? SupportOptionCard({
                title: 'Slack community',
                description:
                  'Ask questions and connect with other instructors and the PrairieLearn team.',
                href: config.supportSlackUrl,
                action: 'Join Slack',
                icon: 'bi-slack',
              })
            : ''
        }
        ${
          config.supportOfficeHoursUrl
            ? SupportOptionCard({
                title: 'Zoom office hours',
                description:
                  'Meet with the PrairieLearn team for live help. Drop in on Thursdays, 3–4 p.m. Central Time.',
                href: config.supportOfficeHoursUrl,
                action: 'Join office hours',
                icon: 'bi-camera-video',
              })
            : ''
        }
        ${SupportOptionCard({
          title: 'Documentation',
          description: 'Browse guides and reference material for using PrairieLearn.',
          href: 'https://docs.prairielearn.com',
          action: 'View documentation',
          icon: 'bi-book',
        })}
        ${SupportOptionCard({
          title: 'Email support',
          description: 'Contact the PrairieLearn team for private questions or additional support.',
          href: 'mailto:support@prairielearn.com',
          action: 'Send email',
          icon: 'bi-envelope',
          newTab: false,
        })}
      </div>
    `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function SupportOptionCard({
  title,
  description,
  href,
  action,
  icon,
  newTab = true,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: string;
  newTab?: boolean;
}) {
  return html`
    <div class="col">
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          <h3 class="h5">${title}</h3>
          <p class="card-text">${description}</p>
          <a
            class="btn btn-primary mt-auto"
            href="${href}"
            target="${newTab ? '_blank' : null}"
            rel="${newTab ? 'noreferrer' : null}"
          >
            <i class="bi ${icon} me-1" aria-hidden="true"></i>
            ${action}
          </a>
        </div>
      </div>
    </div>
  `;
}

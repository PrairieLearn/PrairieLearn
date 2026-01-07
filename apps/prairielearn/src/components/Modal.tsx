import { type HtmlSafeString, html } from '@prairielearn/html';

interface ModalProps {
  body?: HtmlSafeString | string;
  content?: HtmlSafeString | string;
  footer?: HtmlSafeString | string;
  id: string;
  title: string;
  size?: 'default' | 'modal-sm' | 'modal-lg' | 'modal-xl';
  form?: boolean;
  formEncType?: string;
  formMethod?: string;
  formAction?: string;
  formClass?: string;
}

export function Modal({
  body,
  content,
  footer,
  id,
  title,
  size = 'modal-lg',
  form = true,
  formEncType,
  formMethod = 'POST',
  formAction,
  formClass,
}: ModalProps): HtmlSafeString {
  const titleId = `${id}-title`;
  const modal = html`
    <div class="modal fade" tabindex="-1" role="dialog" id="${id}" aria-labelledby="${titleId}">
      <div class="modal-dialog ${size === 'default' ? '' : size}" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4" id="${titleId}">${title}</h2>
          </div>
          ${body ? html`<div class="modal-body">${body}</div>` : ''} ${content ?? ''}
          ${footer ? html`<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  if (!form) return modal;

  return html`
    <form
      method="${formMethod}"
      autocomplete="off"
      ${formEncType ? html`enctype="${formEncType}"` : ''}
      ${formAction ? html`action="${formAction}"` : ''}
      ${formClass ? html`class="${formClass}"` : ''}
    >
      ${modal}
    </form>
  `;
}

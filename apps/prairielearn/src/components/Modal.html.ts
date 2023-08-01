import { html, HtmlSafeString } from '@prairielearn/html';

interface ModalProps {
  body?: HtmlSafeString | string;
  content?: HtmlSafeString | string;
  footer?: HtmlSafeString | string;
  id: string;
  title: string;
  size?: 'default' | 'modal-sm' | 'modal-lg' | 'modal-xl';
  formEncType?: string;
  formMethod?: string;
  formAction?: string;
  preventSubmitOnEnter?: boolean;
}

export function Modal({
  body,
  content,
  footer,
  id,
  title,
  size = 'modal-lg',
  formEncType,
  formMethod = 'POST',
  formAction,
}: ModalProps): HtmlSafeString {
  const titleId = `${id}-title`;
  return html`
    <div class="modal fade" tabindex="-1" role="dialog" id="${id}" aria-labelledby="${titleId}">
      <div class="modal-dialog ${size === 'default' ? '' : size}" role="document">
        <div class="modal-content">
          <form
            method="${formMethod}"
            autocomplete="off"
            ${formEncType ? html`enctype="${formEncType}"` : ''}
            ${formAction ? html`action="${formAction}"` : ''}
          >
            <div class="modal-header">
              <h4 class="modal-title" id=${titleId}>${title}</h4>
            </div>
            ${body ? html`<div class="modal-body">${body}</div>` : ''} ${content ? content : ''}
            ${footer ? html`<div class="modal-footer">${footer}</div>` : ''}
          </form>
        </div>
      </div>
    </div>
  `;
}

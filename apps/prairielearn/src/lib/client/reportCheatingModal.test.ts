import { JSDOM } from 'jsdom';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';

import { setupReportCheatingModal } from './reportCheatingModal.js';

let dom: JSDOM;

function dispatchFormEvent(type: string) {
  const form = dom.window.document.querySelector<HTMLFormElement>('.js-report-cheating-form')!;
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

function jsonResponse(type: 'error' | 'success', status: number) {
  return Response.json(
    { type, message: `${type} message` },
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('setupReportCheatingModal', () => {
  beforeEach(() => {
    dom = new JSDOM(
      `
        <form class="js-report-cheating-form" action="/pl/report-cheating">
          <div id="reportCheatingModal">
            <div class="js-report-cheating-fields">
              <textarea name="report">Original report</textarea>
            </div>
            <div class="d-none js-report-cheating-loading"></div>
            <div class="d-none js-report-cheating-success"></div>
            <div class="d-none js-report-cheating-error"></div>
            <input name="submission_id" value="11111111-1111-4111-8111-111111111111">
            <button type="button" class="js-report-cheating-cancel">Cancel</button>
            <button type="submit" class="js-report-cheating-submit">
              <span class="js-report-cheating-submit-label">Submit report</span>
            </button>
          </div>
        </form>
      `,
      { url: 'https://example.com' },
    );
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('FormData', dom.window.FormData);
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('prevents duplicate submission and modal dismissal while a request is in flight', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setupReportCheatingModal();

    dispatchFormEvent('submit');
    dispatchFormEvent('submit');
    assert.equal(fetchMock.mock.calls.length, 1);

    const modal = dom.window.document.querySelector<HTMLElement>('#reportCheatingModal')!;
    const hideEvent = new dom.window.Event('hide.bs.modal', { cancelable: true });
    modal.dispatchEvent(hideEvent);
    assert.isTrue(hideEvent.defaultPrevented);

    resolveFetch(jsonResponse('success', 200));
    await vi.waitFor(() => {
      assert.isFalse(
        dom.window.document
          .querySelector<HTMLElement>('.js-report-cheating-success')!
          .classList.contains('d-none'),
      );
    });

    const hideAfterSuccess = new dom.window.Event('hide.bs.modal', { cancelable: true });
    modal.dispatchEvent(hideAfterSuccess);
    assert.isFalse(hideAfterSuccess.defaultPrevented);
  });

  it('retries an unchanged report with the same submission ID', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse('error', 502))
      .mockResolvedValueOnce(jsonResponse('success', 200));
    vi.stubGlobal('fetch', fetchMock);
    setupReportCheatingModal();

    dispatchFormEvent('submit');
    await vi.waitFor(() => {
      assert.isFalse(
        dom.window.document
          .querySelector<HTMLElement>('.js-report-cheating-error')!
          .classList.contains('d-none'),
      );
    });
    dispatchFormEvent('submit');
    await vi.waitFor(() => assert.equal(fetchMock.mock.calls.length, 2));

    const firstBody = fetchMock.mock.calls[0][1].body;
    const secondBody = fetchMock.mock.calls[1][1].body;
    assert.instanceOf(firstBody, URLSearchParams);
    assert.instanceOf(secondBody, URLSearchParams);
    assert.equal(firstBody.get('submission_id'), secondBody.get('submission_id'));
  });

  it('rotates the submission ID when the report changes after a failed attempt', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse('error', 502))
      .mockResolvedValueOnce(jsonResponse('success', 200));
    vi.stubGlobal('fetch', fetchMock);
    setupReportCheatingModal();

    dispatchFormEvent('submit');
    await vi.waitFor(() => {
      assert.isFalse(
        dom.window.document
          .querySelector<HTMLElement>('.js-report-cheating-error')!
          .classList.contains('d-none'),
      );
    });

    const report =
      dom.window.document.querySelector<HTMLTextAreaElement>('textarea[name="report"]')!;
    report.value = 'Edited report';
    report.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dispatchFormEvent('submit');
    await vi.waitFor(() => assert.equal(fetchMock.mock.calls.length, 2));

    const firstBody = fetchMock.mock.calls[0][1].body;
    const secondBody = fetchMock.mock.calls[1][1].body;
    assert.instanceOf(firstBody, URLSearchParams);
    assert.instanceOf(secondBody, URLSearchParams);
    assert.notEqual(firstBody.get('submission_id'), secondBody.get('submission_id'));
    assert.equal(secondBody.get('report'), 'Edited report');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkPrintSnapshotId, createPrintSnapshotId } from './print-snapshot-id.js';

const secretKey = 'print-snapshot-test-key';
const snapshot = {
  assessmentInstanceId: '123',
  authnUserId: '45',
  search: new URLSearchParams('paper_size=Letter&form_label=A&document=assessment'),
  questionListDigest: 'question-list-1',
  html: '<!doctype html>\n<html><head></head><body>Question 1</body></html>',
  source: { html: '<section>Question 1</section>', figures: [] },
};

afterEach(() => vi.useRealTimers());

describe('print snapshot IDs', () => {
  it('binds a preview to its form, layout, HTML, and Word source', () => {
    const id = createPrintSnapshotId(snapshot, secretKey);
    expect(checkPrintSnapshotId({ ...snapshot, id }, secretKey)).toBe(true);
    expect(
      checkPrintSnapshotId(
        {
          ...snapshot,
          id,
          search: new URLSearchParams('document=assessment&form_label=A&paper_size=Letter'),
        },
        secretKey,
      ),
    ).toBe(true);
    expect(checkPrintSnapshotId({ ...snapshot, id, source: undefined }, secretKey)).toBe(true);
    expect(
      checkPrintSnapshotId({ ...snapshot, id, questionListDigest: 'question-list-2' }, secretKey),
    ).toBe(false);
    expect(checkPrintSnapshotId({ ...snapshot, id, assessmentInstanceId: '124' }, secretKey)).toBe(
      false,
    );
    expect(
      checkPrintSnapshotId(
        { ...snapshot, id, search: new URLSearchParams('paper_size=A4') },
        secretKey,
      ),
    ).toBe(false);
    expect(
      checkPrintSnapshotId({ ...snapshot, id, html: snapshot.html + ' changed' }, secretKey),
    ).toBe(false);
    expect(
      checkPrintSnapshotId(
        { ...snapshot, id, source: { ...snapshot.source, html: 'Different question' } },
        secretKey,
      ),
    ).toBe(false);
  });

  it('rejects expired or altered IDs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    const id = createPrintSnapshotId(snapshot, secretKey);
    expect(checkPrintSnapshotId({ ...snapshot, id: id + 'changed' }, secretKey)).toBe(false);
    vi.setSystemTime(new Date('2026-10-14T12:00:01Z'));
    expect(checkPrintSnapshotId({ ...snapshot, id }, secretKey)).toBe(false);
  });

  it('accepts equivalent HTML attribute serialization from different browsers', () => {
    const html =
      '<!doctype html>\n<html><head></head><body><math data-speech="<mark name=&quot;0&quot;/> a">a</math></body></html>';
    const id = createPrintSnapshotId({ ...snapshot, html }, secretKey);
    expect(
      checkPrintSnapshotId(
        {
          ...snapshot,
          id,
          html: html.replace('<mark name=&quot;0&quot;/>', '&lt;mark name=&quot;0&quot;/&gt;'),
        },
        secretKey,
      ),
    ).toBe(true);
    expect(
      checkPrintSnapshotId(
        { ...snapshot, id, html: html.replace('>a</math>', '>b</math>') },
        secretKey,
      ),
    ).toBe(false);
  });
});

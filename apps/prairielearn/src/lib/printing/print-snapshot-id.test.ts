import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkPrintSnapshotId,
  createPrintSnapshotId,
  digestPrintHtml,
} from './print-snapshot-id.js';

const secretKey = 'print-snapshot-test-key';
const snapshot = {
  printFormId: '123',
  authnUserId: '45',
  search: new URLSearchParams('paper_size=Letter&form_label=A&document=assessment'),
  questionListDigest: 'question-list-1',
  html: '<!doctype html>\n<html><head></head><body>Question 1</body></html>',
  source: { html: '<section>Question 1</section>', figures: [] },
};
const htmlDigest = digestPrintHtml(snapshot.html);

afterEach(() => vi.useRealTimers());

describe('print snapshot IDs', () => {
  it('binds a preview to its form, layout, question list, and Word source', () => {
    const id = createPrintSnapshotId(snapshot, secretKey);
    expect(checkPrintSnapshotId({ ...snapshot, id }, secretKey)).toBe(htmlDigest);
    expect(
      checkPrintSnapshotId(
        {
          ...snapshot,
          id,
          search: new URLSearchParams('document=assessment&form_label=A&paper_size=Letter'),
        },
        secretKey,
      ),
    ).toBe(htmlDigest);
    expect(checkPrintSnapshotId({ ...snapshot, id, source: undefined }, secretKey)).toBe(
      htmlDigest,
    );
    expect(
      checkPrintSnapshotId({ ...snapshot, id, questionListDigest: 'question-list-2' }, secretKey),
    ).toBeNull();
    expect(checkPrintSnapshotId({ ...snapshot, id, printFormId: '124' }, secretKey)).toBeNull();
    expect(
      checkPrintSnapshotId(
        { ...snapshot, id, search: new URLSearchParams('paper_size=A4') },
        secretKey,
      ),
    ).toBeNull();
    expect(
      checkPrintSnapshotId(
        { ...snapshot, id, source: { ...snapshot.source, html: 'Different question' } },
        secretKey,
      ),
    ).toBeNull();
  });

  it('rejects expired or altered IDs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    const id = createPrintSnapshotId(snapshot, secretKey);
    expect(checkPrintSnapshotId({ ...snapshot, id: id + 'changed' }, secretKey)).toBeNull();
    vi.setSystemTime(new Date('2026-10-14T12:00:01Z'));
    expect(checkPrintSnapshotId({ ...snapshot, id }, secretKey)).toBeNull();
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { OverlayTrigger } from './OverlayTrigger.js';

vi.mock('react-bootstrap', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    OverlayTrigger: ({
      children,
      overlay,
    }: {
      children: React.ReactNode;
      overlay: React.ReactNode;
    }) => (
      <>
        {children}
        {overlay}
      </>
    ),
  };
});

it('preserves the default tooltip role for hover and focus popovers', () => {
  const markup = renderToStaticMarkup(
    <OverlayTrigger
      trigger={['hover', 'focus']}
      popover={{
        body: 'Help text',
        props: { 'aria-label': 'Help', id: 'help-popover' },
      }}
    >
      <button type="button">Help</button>
    </OverlayTrigger>,
  );

  expect(markup).toContain('role="tooltip"');
  expect(markup).toContain('aria-label="Help"');
  expect(markup).not.toContain('role="dialog"');
});

it('names click popovers as dialogs', () => {
  const markup = renderToStaticMarkup(
    <OverlayTrigger trigger="click" popover={{ header: 'Help', body: 'Help text' }}>
      <button type="button">Help</button>
    </OverlayTrigger>,
  );

  const headerId = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
  expect(markup).toContain('role="dialog"');
  expect(headerId).toBeDefined();
  expect(markup).toContain(`id="${headerId}"`);
  expect(markup).toContain('>Help<');
});

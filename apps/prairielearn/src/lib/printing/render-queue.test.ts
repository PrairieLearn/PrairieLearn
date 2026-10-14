import { describe, expect, it, vi } from 'vitest';

import { RenderQueue } from './render-queue.js';

function createGate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('RenderQueue', () => {
  it('runs a waiting preview before an older export', async () => {
    const queue = new RenderQueue(1, 4, 1);
    const gate = createGate();
    const order: string[] = [];
    const active = queue.run(
      async () => {
        order.push('active');
        await gate.opened;
      },
      0,
      'PDF',
    );
    await vi.waitFor(() => expect(queue.getLoad().active).toBe(1));
    expect(queue.getLoad().canStartImmediately).toBe(false);
    const exportRender = queue.run(
      async () => {
        order.push('export');
      },
      0,
      'PDF',
    );
    const previewRender = queue.run(
      async () => {
        order.push('preview');
      },
      0,
      'preview',
      'preview',
    );

    expect(queue.getLoad()).toMatchObject({ active: 1, waiting: 2, waitingPreviews: 1 });
    gate.open();
    await Promise.all([active, exportRender, previewRender]);
    expect(order).toEqual(['active', 'preview', 'export']);
    expect(queue.getLoad()).toMatchObject({ active: 0, waiting: 0 });
    expect(queue.getLoad().canStartImmediately).toBe(true);
  });

  it('reserves waiting room for previews when exports fill their share', async () => {
    const queue = new RenderQueue(1, 4, 1);
    const gate = createGate();
    const active = queue.run(async () => await gate.opened, 0, 'PDF');
    await vi.waitFor(() => expect(queue.getLoad().active).toBe(1));
    const exports = Array.from({ length: 3 }, () => queue.run(async () => {}, 0, 'PDF'));
    const preview = queue.run(async () => {}, 0, 'preview', 'preview');

    try {
      await expect(queue.run(async () => {}, 0, 'PDF')).rejects.toThrow(
        'Print rendering is busy. Try this export again shortly.',
      );
      expect(queue.getLoad()).toMatchObject({ waiting: 4, waitingPreviews: 1 });
    } finally {
      gate.open();
      await Promise.all([active, ...exports, preview]);
    }
  });

  it('lets an export proceed after three waiting previews', async () => {
    const queue = new RenderQueue(1, 6);
    const gate = createGate();
    const order: string[] = [];
    const active = queue.run(async () => await gate.opened, 0, 'PDF');
    await vi.waitFor(() => expect(queue.getLoad().active).toBe(1));
    const waiting = [
      queue.run(
        async () => {
          order.push('export');
        },
        0,
        'PDF',
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        queue.run(
          async () => {
            order.push(`preview ${index + 1}`);
          },
          0,
          'preview',
          'preview',
        ),
      ),
    ];

    gate.open();
    await Promise.all([active, ...waiting]);
    expect(order).toEqual(['preview 1', 'preview 2', 'preview 3', 'export', 'preview 4']);
  });
});

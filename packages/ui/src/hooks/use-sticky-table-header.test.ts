// @vitest-environment jsdom
import { type RefObject, act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStickyTableHeader } from './use-sticky-table-header.js';

class TestResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
}

function TestHook({
  controlsRef,
  scrollRef,
  headerRef,
  tableRef,
}: {
  controlsRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLTableSectionElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
}) {
  useStickyTableHeader({ controlsRef, scrollRef, headerRef, tableRef });
  return null;
}

describe('useStickyTableHeader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches after initially null refs are populated and cleans up on unmount', () => {
    const resizeObservers: TestResizeObserver[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class extends TestResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super(callback);
          resizeObservers.push(this);
        }
      },
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

    const controlsRef: { current: HTMLDivElement | null } = { current: null };
    const scrollRef: { current: HTMLDivElement | null } = { current: null };
    const headerRef: { current: HTMLTableSectionElement | null } = { current: null };
    const tableRef: { current: HTMLTableElement | null } = { current: null };
    const rootElement = document.createElement('div');
    const root = createRoot(rootElement);

    act(() => {
      root.render(createElement(TestHook, { controlsRef, scrollRef, headerRef, tableRef }));
    });
    expect(resizeObservers).toHaveLength(0);

    const controls = document.createElement('div');
    const scroller = document.createElement('div');
    const header = document.createElement('thead');
    const table = document.createElement('table');
    controlsRef.current = controls;
    scrollRef.current = scroller;
    headerRef.current = header;
    tableRef.current = table;

    const scrollerAddListener = vi.spyOn(scroller, 'addEventListener');
    const scrollerRemoveListener = vi.spyOn(scroller, 'removeEventListener');
    const headerAddListener = vi.spyOn(header, 'addEventListener');
    const headerRemoveListener = vi.spyOn(header, 'removeEventListener');

    act(() => {
      root.render(createElement(TestHook, { controlsRef, scrollRef, headerRef, tableRef }));
    });

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0]?.observe).toHaveBeenCalledTimes(3);
    expect(scrollerAddListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
    expect(headerAddListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });

    const replacementScroller = document.createElement('div');
    const replacementScrollerAddListener = vi.spyOn(replacementScroller, 'addEventListener');
    scrollRef.current = replacementScroller;

    act(() => {
      root.render(createElement(TestHook, { controlsRef, scrollRef, headerRef, tableRef }));
    });

    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(scrollerRemoveListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(resizeObservers).toHaveLength(2);
    expect(replacementScrollerAddListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });

    window.dispatchEvent(new Event('scroll'));
    act(() => root.unmount());

    expect(resizeObservers[1]?.disconnect).toHaveBeenCalledOnce();
    expect(headerRemoveListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});

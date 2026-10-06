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

  it('positions the fixed header below the sticky controls inset', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const controls = document.createElement('div');
    const scroller = document.createElement('div');
    const header = document.createElement('thead');
    const table = document.createElement('table');
    vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 8, 500, 100));
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 80, 500, 800));
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 40));
    Object.defineProperty(scroller, 'clientWidth', { value: 500 });
    const controlsRef: { current: HTMLDivElement | null } = { current: controls };
    const scrollRef: { current: HTMLDivElement | null } = { current: scroller };
    const headerRef: { current: HTMLTableSectionElement | null } = { current: header };
    const tableRef: { current: HTMLTableElement | null } = { current: table };
    const root = createRoot(document.createElement('div'));

    act(() => {
      root.render(createElement(TestHook, { controlsRef, scrollRef, headerRef, tableRef }));
    });

    expect(header.style.position).toBe('fixed');
    expect(header.style.top).toBe('108px');

    act(() => root.unmount());
  });

  it('cleans up listeners, observer, and animation frame on unmount', () => {
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

    const controls = document.createElement('div');
    const scroller = document.createElement('div');
    const header = document.createElement('thead');
    const table = document.createElement('table');
    const controlsRef: { current: HTMLDivElement | null } = { current: controls };
    const scrollRef: { current: HTMLDivElement | null } = { current: scroller };
    const headerRef: { current: HTMLTableSectionElement | null } = { current: header };
    const tableRef: { current: HTMLTableElement | null } = { current: table };
    const root = createRoot(document.createElement('div'));
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

    window.dispatchEvent(new Event('scroll'));
    act(() => root.unmount());

    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(scrollerRemoveListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(headerRemoveListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});

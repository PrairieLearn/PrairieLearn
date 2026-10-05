import { type RefObject, useEffect, useRef } from 'react';

export function useStickyTableHeader({
  controlsRef,
  scrollRef,
  headerRef,
  tableRef,
}: {
  controlsRef?: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLTableSectionElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
}) {
  const activeElementsRef = useRef<{
    controls: HTMLDivElement | null;
    scroller: HTMLDivElement | null;
    header: HTMLTableSectionElement | null;
    table: HTMLTableElement | null;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Retain one semantic header and reserve its space while it is viewport-fixed.
  // Translating on every scroll event lags behind compositor-driven scrolling.
  useEffect(() => {
    const controls = controlsRef?.current ?? null;
    const scroller = scrollRef.current;
    const header = headerRef.current;
    const table = tableRef.current;
    const elements = { controls, scroller, header, table };

    if (
      activeElementsRef.current?.controls === controls &&
      activeElementsRef.current?.scroller === scroller &&
      activeElementsRef.current?.header === header &&
      activeElementsRef.current?.table === table
    ) {
      return;
    }

    cleanupRef.current?.();
    activeElementsRef.current = elements;
    if (!controls || !scroller || !header || !table) return;

    let frame = 0;
    let fixed = false;
    const originalControlsPosition = controls.style.position;
    const reset = () => {
      fixed = false;
      header.style.position = 'relative';
      header.style.width = '100%';
      for (const property of ['top', 'left', 'overflow-x']) header.style.removeProperty(property);
      table.style.removeProperty('padding-top');
    };
    const position = () => {
      const bounds = scroller.getBoundingClientRect();
      const controlsHeight = controls.getBoundingClientRect().height;
      const headerHeight = header.getBoundingClientRect().height;
      const compact = controlsHeight + headerHeight > window.innerHeight / 2;
      controls.style.position = compact ? 'static' : originalControlsPosition;
      if (compact || bounds.top >= controlsHeight || bounds.bottom <= 0) {
        reset();
        return;
      }
      fixed = true;
      table.style.paddingTop = `${headerHeight}px`;
      header.style.position = 'fixed';
      header.style.top = `${Math.min(controlsHeight, bounds.bottom - headerHeight)}px`;
      header.style.left = `${bounds.left}px`;
      header.style.width = `${scroller.clientWidth}px`;
      header.style.overflowX = 'hidden';
      header.scrollLeft = scroller.scrollLeft;
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        position();
      });
    };
    const scrollBody = () => {
      if (fixed && header.scrollLeft !== scroller.scrollLeft) {
        header.scrollLeft = scroller.scrollLeft;
      }
    };
    const scrollHeader = () => {
      // Browser focus navigation can scroll overflow:hidden header content too.
      if (fixed && scroller.scrollLeft !== header.scrollLeft) {
        scroller.scrollLeft = header.scrollLeft;
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(controls);
    observer.observe(scroller);
    observer.observe(header);
    // The cleanup is retained so stable ref objects can switch DOM targets after later renders.
    /* eslint-disable @eslint-react/web-api-no-leaked-event-listener */
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    scroller.addEventListener('scroll', scrollBody, { passive: true });
    header.addEventListener('scroll', scrollHeader, { passive: true });
    /* eslint-enable @eslint-react/web-api-no-leaked-event-listener */
    position();
    cleanupRef.current = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      scroller.removeEventListener('scroll', scrollBody);
      header.removeEventListener('scroll', scrollHeader);
      reset();
      controls.style.position = originalControlsPosition;
    };
  });

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      activeElementsRef.current = null;
    },
    [],
  );
}

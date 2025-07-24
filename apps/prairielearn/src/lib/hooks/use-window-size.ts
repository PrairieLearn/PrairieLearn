/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
import * as React from 'react';

interface WindowSizeState {
  width: number;
  height: number;
  offsetTop: number;
}

/**
 * Custom hook to track window size and viewport information
 * @returns Current window dimensions and offsetTop
 */
export function useWindowSize(): WindowSizeState {
  const [windowSize, setWindowSize] = React.useState<WindowSizeState>({
    width: 0,
    height: 0,
    offsetTop: 0,
  });

  React.useEffect(() => {
    handleResize();

    function handleResize() {
      if (typeof window === 'undefined') return;

      const vp = window.visualViewport;
      if (!vp) return;

      const { width = 0, height = 0, offsetTop = 0 } = vp;

      // Only update state if values have changed
      setWindowSize((state) => {
        if (width === state.width && height === state.height && offsetTop === state.offsetTop) {
          return state;
        }

        return { width, height, offsetTop };
      });
    }

    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleResize);
      visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleResize);
        visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);

  return windowSize;
}

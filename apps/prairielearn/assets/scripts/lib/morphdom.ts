import morphdom from 'morphdom';

declare global {
  interface Window {
    morphdom: typeof morphdom;
  }
}

window.morphdom = morphdom;

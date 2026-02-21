import { withResolvers } from '@prairielearn/utils';

// Default to SVG, as lines were sometimes disappearing when using the CHTML renderer. Note that
// some elements (e.g., pl-drawing) depend on an SVG output.
const outputComponent = 'output/svg';

declare global {
  interface Window {
    MathJax: any;
  }
}

const {
  promise: mathjaxPromise,
  resolve: mathjaxResolve,
  reject: mathjaxReject,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
} = withResolvers<void>();

(() => {
  // Skip initialization on the server (no window object).
  if (typeof window === 'undefined') return;

  if (window.MathJax) {
    // Something else already loaded MathJax on this page. Just resolve the promise
    // once MathJax reports that it is ready.
    window.MathJax.startup.promise.then(mathjaxResolve, mathjaxReject);
    return;
  }

  window.MathJax = {
    options: {
      // We previously documented the `tex2jax_ignore` class, so we'll keep
      // supporting it for backwards compatibility.
      ignoreHtmlClass: 'mathjax_ignore|tex2jax_ignore',
      processHtmlClass: 'mathjax_process',
    },
    tex: {
      inlineMath: [
        ['$', '$'],
        ['\\(', '\\)'],
      ],
    },
    svg: {
      // Improve accessibility by making math font rendering slightly bolder.
      blacker: 13,

      // Because of the functionality inherited from MathJax v3, instructors
      // expect Math expressions not to line-break. MathJax v4 changed the
      // default behavior to allow line breaks. We explicitly disable line
      // breaks to maintain the previous behavior. This is especially important
      // for elements like pl-drawing where line breaks can cause rendering
      // issues, since pl-drawing relies on MathJax returning a single SVG
      // element.
      // See: https://docs.mathjax.org/en/latest/output/linebreaks.html#in-line-breaking
      linebreaks: { inline: false },
    },
    loader: {
      load: ['input/tex', 'ui/menu', outputComponent],
      paths: {
        // MathJax will retrieve the font from CDN by default, but we want it to
        // use our locally installed copy. This is particularly important for
        // CBTF environments, which restrict network access.
        'mathjax-newcm': document
          .querySelector('meta[name="mathjax-fonts-path"]')
          ?.getAttribute('content'),
      },
    },
    // Kept for compatibility reasons.
    onReady: (cb: any) => {
      void mathjaxPromise.then(cb);
    },
    // Adds a custom function so that, regardless if Mathjax.typesetPromise() is accessed before or
    // after the page is loaded, it will be resolved when the page is ready.
    typesetPromise: mathjaxTypeset,
    startup: {
      // Adds a custom promise so that, regardless if Mathjax.startup.promise is accessed before or
      // after the page is loaded, it will be resolved when the page is ready.
      promise: mathjaxPromise,
      ready: () => {
        window.MathJax.startup.defaultReady();
        window.MathJax.Hub = {
          Queue() {
            console.warn(
              'MathJax.Hub.Queue() has been deprecated in 3.0, please use MathJax.typesetPromise()',
            );
            window.MathJax.typesetPromise();
          },
        };
      },
      pageReady: () => {
        return window.MathJax.startup.defaultPageReady().then(
          () => mathjaxResolve(),
          (err: any) => mathjaxReject(err),
        );
      },
    },
  };

  // The MathJax initialization script will wipe our `typesetPromise` function
  // until it has loaded itself, so we'll do this hacky little thing to ensure
  // that `typesetPromise` is always available, even while MathJax is loading.
  let mj = window.MathJax;
  Object.defineProperty(window, 'MathJax', {
    set: (value) => {
      mj = value;
      mj.typesetPromise = mathjaxTypeset;
    },
    get() {
      return mj;
    },
    configurable: true,
    enumerable: true,
  });
})();

export async function mathjaxTypeset(elements?: Element[]) {
  // No-op on the server.
  if (typeof window === 'undefined') return;

  await mathjaxPromise;
  return window.MathJax.typesetPromise(elements);
}

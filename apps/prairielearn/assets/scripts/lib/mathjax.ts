// Default to SVG, as lines were sometimes disappearing when using the CHTML renderer. Note that
// some elements (e.g., pl-drawing) depend on an SVG output.
const outputComponent = 'output/svg';

declare global {
  interface Window {
    MathJax: any;
  }
}

const mathjaxPromise = new Promise<void>((resolve, reject) => {
  window.MathJax = {
    options: {
      // We previously documented the `tex2jax_ignore` class, so we'll keep
      // supporting it for backwards compatibility.
      ignoreHtmlClass: 'mathjax_ignore|tex2jax_ignore',
    },
    tex: {
      inlineMath: [
        ['$', '$'],
        ['\\(', '\\)'],
      ],
    },
    svg: {
      // Using local instead of global prevents a MathJax bug if the user
      // tries to switch the renderer with the pop-up menu. The bug will
      // supposedly be fixed in MathJax 4, and then this could be changed
      // back to global.
      // Refer to issues on MathJax:
      // https://github.com/mathjax/MathJax/issues/2924
      // https://github.com/mathjax/MathJax/issues/2956
      // This PR was merged but won't be released until MathJax v4:
      // https://github.com/mathjax/MathJax-src/pull/859
      fontCache: 'local',
    },
    loader: {
      load: ['input/tex', 'ui/menu', outputComponent],
    },
    // Kept for compatibility reasons.
    onReady: (cb: any) => {
      mathjaxPromise.then(cb);
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
          () => resolve(),
          (err: any) => reject(err),
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
});

export async function mathjaxTypeset() {
  await mathjaxPromise;
  return window.MathJax.typesetPromise();
}

export async function mathjaxConvert(value: string) {
  await mathjaxPromise;
  return (window.MathJax.tex2chtmlPromise || window.MathJax.tex2svgPromise)(value);
}

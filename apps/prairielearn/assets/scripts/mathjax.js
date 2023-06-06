// No typechecking as MathJax does not work well with that

// Default to SVG, as lines were sometimes disappearing when using the CHTML renderer.
const outputComponent = 'output/svg';

const mathjaxPromise = new Promise((resolve, _reject) => {
  window.MathJax = {
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
    onReady: (cb) => {
      window.safeMathjaxPromise.then(cb);
    },
    startup: {
      // Adds a custom promise so that, regardless if Mathjax.startup.promise is accessed before or
      // after the page is loaded, it will be resolved when the page is ready.
      promise: mathjaxPromise,
      ready: () => {
        window.MathJax.startup.defaultReady();
        window.MathJax.Hub = {
          Queue: function () {
            console.warn(
              'MathJax.Hub.Queue() has been deprecated in 3.0, please use MathJax.typesetPromise()'
            );
            window.MathJax.typesetPromise();
          },
        };
      },
      pageReady: () => {
        window.MathJax.startup.defaultPageReady();
        resolve();
      },
    },
  };
});

module.exports = {
  mathjaxTypeset: async () => {
    await window.MathJax.promise;
    return window.MathJax.typesetPromise();
  },
  mathjaxConvert: async (value) => {
    await window.MathJax.promise;
    return (window.MathJax.tex2chtmlPromise || window.MathJax.tex2svgPromise)(value);
  },
};

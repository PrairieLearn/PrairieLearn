/** MathJax extensions not in @types/mathjax */
declare namespace MathJax {
  function typesetPromise(elements?: Element[]): Promise<void>;

  namespace startup {
    const promise: Promise<void>;
  }
}

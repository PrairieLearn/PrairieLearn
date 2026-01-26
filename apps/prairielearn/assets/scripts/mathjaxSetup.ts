// This file sets up the custom MathJax configuration before startup.js loads.
// Import this script before the mathjax/es5/startup.js script.
//
// This is primarily useful on pages that use hydrated React components that
// themselves import MathJax. We need to separately load the MathJax config
// first so that the MathJax initialization script picks up on it.
import '../../src/lib/client/mathjax.js';

const jsxRuntime = require('original-preact/jsx-runtime');

module.exports = {
  // @ts-expect-error -- TODO describe
  Fragment: jsxRuntime.Fragment,
  jsx: jsxRuntime.jsx,
  jsxs: jsxRuntime.jsxs,
  jsxDEV: jsxRuntime.jsxDEV,
  jsxTemplate: jsxRuntime.jsxTemplate,
  jsxAttr: jsxRuntime.jsxAttr,
  jsxEscape: jsxRuntime.jsxEscape,
  // @ts-expect-error -- TODO describe
  JSX: jsxRuntime.JSX,
};

module.exports.Fragment = jsxRuntime.Fragment;

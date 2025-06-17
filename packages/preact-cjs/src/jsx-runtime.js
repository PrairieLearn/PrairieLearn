const jsxRuntime = require('original-preact/jsx-runtime');

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- The below error only occurs in CI.
// @ts-ignore -- This is missing from the types definitions somehow.
module.exports.Fragment = jsxRuntime.Fragment;
module.exports.jsx = jsxRuntime.jsx;
module.exports.jsxs = jsxRuntime.jsxs;
module.exports.jsxDEV = jsxRuntime.jsxDEV;
module.exports.jsxTemplate = jsxRuntime.jsxTemplate;
module.exports.jsxAttr = jsxRuntime.jsxAttr;
module.exports.jsxEscape = jsxRuntime.jsxEscape;
// @ts-expect-error -- This is missing from the types definitions somehow.
module.exports.JSX = jsxRuntime.JSX;

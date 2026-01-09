if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('preact/debug');
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('preact/devtools');
}

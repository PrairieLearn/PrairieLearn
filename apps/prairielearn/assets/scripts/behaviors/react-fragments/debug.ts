if (process.env.NODE_ENV !== 'production') {
  console.log('Loading Preact debug tools...');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('preact/debug');
} else {
  console.log('Loading Preact devtools...');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('preact/devtools');
}

console.log('process.env.NODE_ENV:', process.env.NODE_ENV);

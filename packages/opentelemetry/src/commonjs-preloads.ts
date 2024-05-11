// The packages below were determined by inspecting the implementation of each
// instrumentation package and finding which packages/files they're patching.
const PRELOAD_PACKAGES = [
  // @opentelemetry/instrumentation-aws
  '@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
  '@aws-sdk/middleware-stack/dist-cjs/MiddlewareStack.js',
  '@aws-sdk/middleware-stack',
  '@aws-sdk/smithy-client',
  'aws-sdk/lib/core.js',
  'aws-sdk',
  // @opentelemetry/instrumentation-connect
  'connect',
  // @opentelemetry/instrumentation-dns
  'dns',
  'dns/promises',
  // @opentelemetry/instrumentation-express
  'express',
  // @opentelemetry/instrumentation-http
  'http',
  'https',
  // @opentelemetry/instrumentation-ioredis
  'ioredis',
  // @opentelemetry/instrumentation-postgres
  'pg',
  'pg-pool',
  // @opentelemetry/instrumentation-redis
  'redis',
];

for (const pkg of PRELOAD_PACKAGES) {
  try {
    // TODO: switch to using `createRequire` once this is native ESM.
    require(pkg);
  } catch (e) {
    // Ignore; package is likely not installed.
  }
}

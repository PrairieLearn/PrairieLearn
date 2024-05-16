import { createRequire } from 'module';

// The packages below were determined by inspecting the implementation of each
// instrumentation package and finding which packages/files they're patching.
const PRELOAD_PACKAGES = [
  // @opentelemetry/instrumentation-aws-sdk
  '@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
  '@aws-sdk/middleware-stack/dist-cjs/MiddlewareStack.js',
  '@aws-sdk/middleware-stack',
  '@smithy/middleware-stack',
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

const require = createRequire(import.meta.url);
for (const pkg of PRELOAD_PACKAGES) {
  try {
    require(pkg);
  } catch (e: any) {
    // If the package is not found, it's fine, it just means that it wasn't
    // installed. We'll throw any other errors.
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }
}

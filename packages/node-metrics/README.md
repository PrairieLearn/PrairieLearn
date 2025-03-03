# `@prairielearn/node-metrics`

A package to collect Node metrics (CPU, memory, etc.) and report them to AWS CloudWatch.

## Usage

```ts
import * as nodeMetrics from '@prairielearn/node-metrics';

// Start collecting and reporting metrics to CloudWatch:
nodeMetrics.start({
  awsConfig: {
    region: 'us-east-2',
    // ...
  },
  intervalSeconds: 10,
  dimensions: [{ Name: 'InstanceId', Value: 'i-1234567890abcdef0' }],
  onError(err) {
    console.error('Error reporting Node metrics:', err);
    // Report to Sentry, etc.
  },
});

// Later, when you're done:
nodeMetrics.stop();
```

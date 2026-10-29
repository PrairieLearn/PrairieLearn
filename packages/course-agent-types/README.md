# `@prairielearn/course-agent-types`

Private contracts shared by the Cloudflare course-agent service and PrairieLearn. This package contains the public workspace lifecycle types and the validated conversation-creation input. It must stay usable in both Workers and Node; do not add server-specific dependencies or private workspace records here.

## Deployment compatibility

The service and PrairieLearn deploy independently. Sharing TypeScript types does not guarantee that both running applications have the same version.

- Prefer additive changes and accept extra response fields that a caller does not use.
- Introduce a new optional input before making callers send it; do not require it until older callers have been upgraded.
- For new lifecycle states or changed meanings, deploy readers that can handle the change before deploying writers that emit it. Otherwise coordinate deployment while the feature is disabled.
- Removing fields, renaming routes, or changing required inputs needs an explicit transition or a coordinated rollout. Typechecking alone cannot establish compatibility.

Only lifecycle status, its failure reason, and its deadline are sent to the browser. Course source configuration, native process/thread identifiers, and backup references belong in the service's private record.

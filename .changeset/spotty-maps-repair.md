---
'@prairielearn/preact-cjs': minor
---

For each VNode, the className property is now automatically set to the class property's value, if available. This enables React-based libraries incompatible with the class prop, particularly react-bootstrap, to receive and apply CSS classes from the `class` property.

This question tests that non-preloaded stdlib modules are importable after the executor's privilege drop.

It exists solely to catch regressions like [#14197](https://github.com/PrairieLearn/PrairieLearn/issues/14197), where the Python stdlib became inaccessible after dropping privileges. The zygote preloads many stdlib modules, so most question code works fine even when the stdlib path is inaccessible. This question deliberately imports modules that are NOT in the zygote preload list.

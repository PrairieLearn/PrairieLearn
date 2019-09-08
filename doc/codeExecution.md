# Code Execution

Central to PrairieLearn is the ability to securely execute arbitrary code. There are two primary contexts in which PrairieLearn must execute code:

* **Question and element code**: This is code from a question's `server.py` or any PrairieLearn/course [elements](elements.md). This code must execute as quickly as possible, as it will be executed any time a question is rendered or graded and thus needs to render during a single HTTP request.
* [**Externally-graded questions**](externalGrading.md): This is code submitted by a student and graded for them by course code. This code can take longer to execute and is queued to be executed on distributed set of machines.

Externally-graded questions and how they are executed is covered in more detail in the [external grading docs](externalGrading.md). This document is primarily concerned with describing how question and element code is executed.

## The Python trampoline

Every time we want to execute code for a question, we want to use a fresh Python environment that could not have been modified or broken by previous code. However, starting up a new Python interpreter is relatively expensive, taking on the order of hundreds of milliseconds. Compared to external grading code execution, the primary concern of question and element code execution (in addition to security) is speed.

To solve this, we've borrowed Android's concept of a [zygote process](https://developer.android.com/topic/performance/memory-overview#SharingRAM), which we call the *trampoline*. Instead of starting a new Python process for every request, we start a special trampoline process that starts a Python interpreter, preloads commonly-used libraries like `numpy` and `lxml`, and forks itself. The fork inherits the file descriptors from the parent, which we use to communicate with the forked process. The forked process will use [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write), which is essentially free. When we want to execute code, we send commands to the forked process over `stdin` and receive the results of executing code over `stdout`. Many commands may be sent during a single use of the forked process. When a question is done being rendered/graded/etc., we send a special `restart` message to the forked process, which will in turn exit with status 0. The trampoline will detect that the child exited normally and immediately refork itself, and the fork will again begin listening for commands. This way, each request will get a fresh Python environment with almost zero overhead.

## The worker pool

A single PrairieLearn server may be serving potentially hundreds or thousands of assessments at one time. To handle this, we actually run a pool of trampoline processes described above that we call the *worker pool*. The pool maintains `N` trampolines and distributes requests to execute Python code across them. Requests are queued and handled in a FIFO basis. The worker pool also handles detecting unhealthy trampoline processes and replacing them with new workers.

## Execution modes

PrairieLearn must execute in two main environments: locally on the computers of people developing course content, and in a production environment. The primary differences between these two environments are a) ease of setup and b) whether or not PrairieLearn is running in a Docker container.

For local development, PrairieLearn must be easy to set up; it should not require complex infrastructure or commands to run. For this use case, PrairieLearn is distributed as a single Docker container that can be run without any external dependencies.

In production, we currently run PrairieLearn outside of Docker directly on an EC2 host.

To account for the variety of contexts in which PrairieLearn is executed, there are three related but distinct ways that PrairieLearn can execute question and element code: `internal`, `native`, and `container`. These modes correspond to the `workersExecutionMode` config value. They are described in more detail below.

## `internal` execution mode

This is how PrairieLearn functioned historically. PrairieLearn would directly execute Python code with limited isolation from the rest of the system. This is largely the process described again, with a pool of Python trampolines.

This is still how PrairieLearn functions by default for local development. The `priairelearn/prairielearn` Docker image that is distributed to users includes all of the Python and R dependencies needed by question and element code, and said code is executed in the same container that PrairieLearn executes in. This is obviously bad for security, but doesn't matter much for local development.


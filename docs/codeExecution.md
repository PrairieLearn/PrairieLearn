# Code Execution

Central to PrairieLearn is the ability to securely execute arbitrary code. There are three primary contexts in which PrairieLearn must execute code:

- **Question and element code**: This is code from a question's `server.py` or any PrairieLearn/course [elements](elements.md). This code must execute as quickly as possible, as it will be executed any time a question is rendered or graded and thus needs to render during a single HTTP request.
- [**Externally-graded questions**](externalGrading.md): This is code submitted by a student and graded for them by course code. This code can take longer to execute and is queued to be executed on a distributed set of machines.
- [**Workspaces**](workspaces/): This is an interactive environment in which a student can write and execute code, in contrast to the non-interactive batch execution by external graders. Workspaces can persist for many hours and so they are executed on a distributed set of machines (the _workspace hosts_, a distinct set from the _external grader hosts_).

The [external grading docs](externalGrading.md) and [workspace docs](workspaces/) describe those execution modes in more detail. This document is primarily concerned with describing how question and element code is executed.

## The Python zygote

Every time we want to execute code for a question, we want to use a fresh Python environment that could not have been modified or broken by previous code. However, starting up a new Python interpreter is relatively expensive, taking on the order of hundreds of milliseconds. Compared to external grading code execution, the primary concern of question and element code execution (in addition to security) is speed.

To solve this, we've borrowed Android's concept of a [zygote process](https://developer.android.com/topic/performance/memory-overview#SharingRAM). Instead of starting a new Python process for every request, we start a special zygote process that starts a Python interpreter, preloads commonly-used libraries like `numpy` and `lxml`, and forks itself. The fork inherits the file descriptors from the parent, which we use to communicate with the forked process. The forked process will use [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write), which is essentially free. When we want to execute code, we send commands to the forked process over `stdin` and receive the results of executing code over file descriptor 3. Many commands may be sent during a single use of the forked process. When a question is done being rendered/graded/etc., we send a special `restart` message to the forked process, which will in turn exit with status 0. The zygote will detect that the child exited normally and immediately refork itself, and the fork will again begin listening for commands. This way, each request will get a fresh Python environment with almost zero overhead.

## The worker pool

A single PrairieLearn server may be serving potentially hundreds or thousands of assessments at one time. To handle this, we actually run a pool of zygotes described above that we call the _worker pool_. The pool maintains `N` zygotes and distributes requests to execute Python code across them. Requests are queued and handled in a FIFO basis. The worker pool also handles detecting unhealthy zygotes and replacing them with new ones.

## Execution modes

PrairieLearn must execute in two main environments: locally on the computers of people developing course content, and in a production environment. The primary differences between these two environments are a) ease of setup and b) whether or not PrairieLearn is running in a Docker container.

For local development, PrairieLearn must be easy to set up; it should not require complex infrastructure or commands to run. For this use case, PrairieLearn is distributed as a single Docker container that can be run without any external dependencies. In production environments, we can shoulder some additional complexity in order to gained improved security and reliability.

To account for the variety of contexts in which PrairieLearn is executed, there are two related but distinct ways that PrairieLearn can execute question and element code: `native` and `container`. These modes correspond to the `workersExecutionMode` config value. They are described in more detail below.

### `native` execution mode

Under this mode, PrairieLearn directly executes Python code with limited isolation from the rest of the system. This is largely the process described above, with a pool of zygotes.

This is still how PrairieLearn functions by default for local development. The `priairelearn/prairielearn` Docker image that is distributed to users includes all of the Python and R dependencies needed by question and element code, and said code is executed in the same container that PrairieLearn executes in. This is obviously bad for security, but doesn't matter for local development.

### `container` execution mode

Under this mode, PrairieLearn uses Docker to provide a degree of isolation from both PrairieLearn and other courses.

Instead of using a pool of zygotes as described above, it actually maintains a pool of Docker containers, each of which runs a simple Node script (the _executor_), which in turn runs a Python zygote. The Node script listens for requests from PrairieLearn and essentially just forwards them to the Python process. You may ask, "Why not just run the zygote as the primary process in the container?" Well, starting up a Docker container is significantly more expensive than starting up a Python interpreter. Given that we ocasionally want to completely restart the Python worker, such as when it encounters an error, having an additional level of indirection allows us to gracefully restart the Python process inside the Docker container without having to restart the entire Docker container.

This mode also allows us to isolate one course from another so that course A cannot see content from course B, and vice versa. To achieve this, we take advantage of bind mounts. When creating a container, PrairieLearn also creates a special directory on the host, and then mounts that directory to `/course` in the container. To execute content for course A, PrairieLearn first bind mounts that course's directory to the container's host directory. This is transitive to the container, which will now see that course's content at `/course`. In the future, when a different course's code needs to be executed in that container, PrairieLearn will simply update the bind mount to point to the other course.

## Code execution in practice

So far, this discussion has been pretty abstract. But what about all the actual code that underpins this stuff? Fear not, dear reader, we haven't forgotten about that!

### Code callers

A _code caller_ serves as an abstraction on top of the different execution modes above and hides the implementation details of exactly how code is executed. There are currently two different types of code callers, referred to here by the filenames of their implementations.

- `lib/code-caller-container` handles executing code inside of Docker containers, as required by the `container` execution mode.
  - This execution mode is only supported on Linux, as it relies on Docker's ability to forward bind mounts, which is not implemented on macOS.
- `lib/code-caller-native` handles executing Python processes directly, as required by the `native` execution mode.

The primary external interface of these callers is the `call()` function, which takes five arguments:

- `type`: the type of code being executed (either `question`, `course-element`, or `core-element`).
- `directory`: the directory containing the file whose code will be executed.
  - For questions, this is an item in a course's `questions` directory.
  - For course elements, this is an item in a course's `elements` directory.
  - For core elements, this is an item in PrairieLearn's `elements` directory.
- `file`: the name of the file whose code will be executed (e.g. `server.py`)
- `fcn`: the name of the function in `file` that will be executed (e.g. `grade` or `render`).
- `args`: an array of JSON-encodeable arguments to the function being called.

The piece of code to execute is specified by (`type`, `directory`, `file`) instead of an absolute path because the location of each file on disk may change between each type of code caller; allowing the code caller to construct the path from that information keeps the code that uses a caller agnostic to the underlying caller being used.

### A full request cycle

Let's walk through a typical request to view a question that requires a function in a corresponding `server.py` file to run.

1. The page request is handled by `pages/studentInstanceQuestion` or similar.
2. That handler calls `getAndRenderVariant` in `lib/question` (a different function would be called if the user were submitting an answer).
3. That function calls an internal function that calls `render` in `question-servers/freeform.js`.
4. That function calls `withCodeCaller` in `lib/workers`. Depending on the active execution mode
   1. If running in `container` mode, a `lib/code-caller-container` caller will be "prepared" for the current course (which sets up necessary bind mounts) and returned.
   2. If running in `native` mode, any available `lib/code-caller-native` caller will be returned.
5. `call(...)` is then repeatedly invoked on the code caller with the appropriate pieces of code to be executed.
6. Once the code caller is no longer needed during this request, `done()` is invoked on it. The forked worker is sent a `restart` message, which will cause the worker to exit and return control to the zygote. The zygote will then fork itself again, and the forked worker will wait until it receives more instructions.
7. Page render completes and the response is sent, thus finishing the request cycle.

## Operating in production

When new versions of PrairieLearn are deployed, it's important to ensure that the appropriate executor image for the version being deployed is present on the machine. This ensures that PrairieLearn is able to serve traffic immediately instead of waiting for the new version to be pulled. The image will be published as `prairielearn/executor:GIT_HASH`, where `GIT_HASH` is the SHA-1 hash of the Git commit that's being deployed.

PrairieLearn will automatically determine the correct version of the executor image to use at runtime. However, in an emergency, it's possible to configure PrairieLearn to use a specific image and tag. Set the `workerExecutorImageRepository` and/or the `workerExecutorImageTag` config options appropriately. Then, ensure the image is present on the machine. Finally, deploy the updated config and restart the server; new requests will be executed in the specified container version.

If the `cacheImageRegistry` option is set and `workerExecutorImageRepository` is NOT set, PrairieLearn will use the image from that registry. If you're specifying `workerExecutorImageRepository` and want to use an image from a specific registry, you should ensure that the registry is included in the `workerExecutionImageRepository` value.

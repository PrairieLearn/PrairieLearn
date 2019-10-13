# Code Execution

Central to PrairieLearn is the ability to securely execute arbitrary code. There are two primary contexts in which PrairieLearn must execute code:

* **Question and element code**: This is code from a question's `server.py` or any PrairieLearn/course [elements](elements.md). This code must execute as quickly as possible, as it will be executed any time a question is rendered or graded and thus needs to render during a single HTTP request.
* [**Externally-graded questions**](externalGrading.md): This is code submitted by a student and graded for them by course code. This code can take longer to execute and is queued to be executed on distributed set of machines.

Externally-graded questions and how they are executed is covered in more detail in the [external grading docs](externalGrading.md). This document is primarily concerned with describing how question and element code is executed.

## The Python zygote

Every time we want to execute code for a question, we want to use a fresh Python environment that could not have been modified or broken by previous code. However, starting up a new Python interpreter is relatively expensive, taking on the order of hundreds of milliseconds. Compared to external grading code execution, the primary concern of question and element code execution (in addition to security) is speed.

To solve this, we've borrowed Android's concept of a [zygote process](https://developer.android.com/topic/performance/memory-overview#SharingRAM). Instead of starting a new Python process for every request, we start a special zygote process that starts a Python interpreter, preloads commonly-used libraries like `numpy` and `lxml`, and forks itself. The fork inherits the file descriptors from the parent, which we use to communicate with the forked process. The forked process will use [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write), which is essentially free. When we want to execute code, we send commands to the forked process over `stdin` and receive the results of executing code over file descriptor 3. Many commands may be sent during a single use of the forked process. When a question is done being rendered/graded/etc., we send a special `restart` message to the forked process, which will in turn exit with status 0. The zygote will detect that the child exited normally and immediately refork itself, and the fork will again begin listening for commands. This way, each request will get a fresh Python environment with almost zero overhead.

## The worker pool

A single PrairieLearn server may be serving potentially hundreds or thousands of assessments at one time. To handle this, we actually run a pool of zygotes described above that we call the *worker pool*. The pool maintains `N` zygotes and distributes requests to execute Python code across them. Requests are queued and handled in a FIFO basis. The worker pool also handles detecting unhealthy zygotes and replacing them with new ones.

## Execution modes

PrairieLearn must execute in two main environments: locally on the computers of people developing course content, and in a production environment. The primary differences between these two environments are a) ease of setup and b) whether or not PrairieLearn is running in a Docker container.

For local development, PrairieLearn must be easy to set up; it should not require complex infrastructure or commands to run. For this use case, PrairieLearn is distributed as a single Docker container that can be run without any external dependencies.

In production, we currently run PrairieLearn outside of Docker directly on an EC2 host.

To account for the variety of contexts in which PrairieLearn is executed, there are three related but distinct ways that PrairieLearn can execute question and element code: `internal`, `native`, and `container`. These modes correspond to the `workersExecutionMode` config value. They are described in more detail below.

### `internal` execution mode

This is how PrairieLearn functioned historically. PrairieLearn would directly execute Python code with limited isolation from the rest of the system. This is largely the process described again, with a pool of zygotes.

This is still how PrairieLearn functions by default for local development. The `priairelearn/prairielearn` Docker image that is distributed to users includes all of the Python and R dependencies needed by question and element code, and said code is executed in the same container that PrairieLearn executes in. This is obviously bad for security, but doesn't matter for local development.

### `native` execution mode

The `native` execution mode is currently used when PrairieLearn is running in production. It uses Docker to provide a degree of isolation from both PrairieLearn and other courses.

Instead of using a pool of zygotes as described above, it actually maintains a pool of Docker containers, each of which runs a simple Node script (the *executor*), which in turn runs a Python zygote. The Node script listens for requests from PrairieLearn and essentially just forwards them to the Python process. You may ask, "Why not just run the zygote as the primary process in the container?" Well, starting up a Docker container is significantly more expensive than starting up a Python interpreter. Given that we ocasionally want to completely restart the Python worker, such as when it encounters an error, having an additional level of indirection allows us to gracefully restart the Python process inside the Docker container without having to restart the entire Docker container.

This mode also allows us to isolate one course from another so that course A cannot see content from course B, and vice versa. To achieve this, we take advantage of bind mounts. When creating a container, PrairieLearn also creates a special directory on the host, and then mounts that directory to `/course` in the container. To execute content for course A, PrairieLearn first bind mounts that course's directory to the container's host directory. This is transitive to the container, which will now see that course's content at `/course`. In the future, when a different course's code needs to be executed in that container, PrairieLearn will simply update the bind mount to point to the other course.

### `container` execution mode

The `container` execution mode is similar to the `native` mode in that code is executed in a container, but is used where PrairieLearn is *also* running in a container. This is primarily useful for when you're running PrairieLearn locally but want to test running course code in isolated containers.

In this case, we can't use the bind mount trick above, as PrairieLearn can't create mounts on the host from inside its container. Instead, we'll need a couple of things:

* In `config.json`, the user must specify the host path for any courses they're mounting into PrairieLearn in `courseDirsHost`.
* The user must mount the Docker socket into PrairieLearn's container, similarly to what they must do when running external grading locally.
* The user must create a "scratch" directory on the host, specify it with the `HOSTFILES_DIR` environment variable, and mount the directory to `/hostfiles` in the PrairieLearn container. PrairieLearn will use this directory to communicate its internal files, including element implementations and the Python zygote, to the host so that they can be mounted into executor containers.

PrairieLearn will then maintain a pool of workers, one per course, with the corresponding host course directory mounted into each container. It will also begin watching the `elements/`, `python/`, and `exampleCourse/` directories and copying their files to `HOSTFILES_DIR` so that they can be accessible to the executor containers. Most of the time, this copy will only take place one time when PrairieLearn boots up, but the continuous copying can be useful if you're running the PrairieLearn container with your own copy of the PrairieLearn code mounted to `/PrairieLearn`. When you edit files in your own copy, they'll magically be copied back to the right place on the host and things will Just Work(tm).

That was a lot of words; let's look at some concrete configs and Docker commands.

Let's assume you have some PrairieLearn course on your machine at `/Users/nathan/git/pl-cs225`. Here's your corresponding config file:

```json
{
  "courseDirs": [
    "/course"
  ],
  "courseDirsHost": {
    "/course": "/Users/nathan/git/pl-cs225"
  },
  "workersExecutionMode": "container"
}
```

Now, we're ready to run PrairieLearn. Say you saved the above config file in `/Users/nathan/config.json`. You can now run the following Docker command:

```sh
docker run --rm -it -p 3000:3000 -v /Users/nathan/git/pl-cs225:/course -v /Users/nathan/config.json:/PrairieLearn/config.json -v /Users/nathan/.plhostfiles:/hostfiles -e HOST_JOBS_DIR=/Users/nathan/.pl_ag_jobs -e HOSTFILES_DIR=/Users/nathan/.plhostfiles -v /var/run/docker.sock:/var/run/docker.sock prairielearn/prairielearn
```

## Code execution in practice

So far, this discussion has been pretty abstract. But what about all the actual code that underpins this stuff? Fear not, dear reader, we haven't forgotten about that!

### Code callers

A *code caller* serves as an abstraction on top of the different execution modes above and hides the implementation details of exactly how code is executed. There are currently two different types of code callers, referred to here by the filenames of their implementations.

* `lib/code-caller-docker` handles executing code inside of Docker containers, as required by the `container` and `native` execution modes.
* `lib/code-caller-python` handles executing Python processes directly, as required by the `internal` execution mode.

The primary external interface of these callers is the `call()` function, which takes five arguments:

* `type`: the type of code being executed (either `question`, `course-element`, or `core-element`).
* `directory`: the directory containing the file whose code will be executed.
  * For questions, this is an item in a course's `questions` directory.
  * For course elements, this is an item in a course's `elements` directory.
  * For core elements, this is an item in PrairieLearn's `elements` directory.
* `file`: the name of the file whose code will be executed (e.g. `server.py`)
* `fcn`: the name of the function in `file` that will be executed (e.g. `grade` or `render`).
* `args`: an array of JSON-encodeable arguments to the function being called.

The piece of code to execute is specified by (`type`, `directory`, `file`) instead of an absolute path because the location of each file on disk may change between each type of code caller; allowing the code caller to construct the path from that information keeps the code that uses a caller agnostic to the underlying caller being used.

### A full request cycle

Let's walk through a typical request to view a question that requires a function in a corresponding `server.py` file to run.

1. The page request is handled by `pages/studentInstanceQuestionHomework` or similar.
2. That handler calls `getAndRenderVariant` in `lib/question` (a different function would be called if the user were submitting an answer).
3. That function calls an internal function that calls `render` in `question-servers/freeform.js`.
4. That function calls `getPythonCaller` in `lib/workers`. Depending on the active execution mode
   1. If running in `container` mode, a `lib/code-caller-docker` caller for the appropriate course will be returned.
   2. If running in `native` mode, a `lib/code-caller-docker` caller will be "prepared" for the current course (which sets up necessary bind mounts) and returned.
   3. If running in `internal` mode, any available `lib/code-caller-python` caller will be returned.
5. `call(...)` is then repeatedly invoked on the code caller with the appropriate pieces of code to be executed.
6. Once the code caller is no longer needed during this request, `done()` is invoked on it. The forked worker is sent a `restart` message, which will cause the worker to exit and return control to the zygote. The zygote will then fork itself again, and the forked worker will wait until it receives more instructions.
7. Page render completes and the response is sent, thus finishing the request cycle.

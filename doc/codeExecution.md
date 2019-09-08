# Code Execution

Central to PrairieLearn is the ability to securely execute arbitrary code. There are two primary contexts in which PrairieLearn must execute code:

* **Question and element code**: This is code from a question's `server.py` or any PrairieLearn/course [elements](elements.md). This code must execute as quickly as possible, as it will be executed any time a question is rendered or graded and thus needs to render during a single HTTP request.
* [**Externally-graded questions**](externalGrading.md): This is code submitted by a student and graded for them by course code. This code can take longer to execute and is queued to be executed on distributed set of machines.

Externally-graded questions and how they are executed is covered in more detail in the [external grading docs](externalGrading.md). This document is primarily concerned with describing how question and element code is executed.

PrairieLearn must execute in two main environments: locally on the computers of people developing course content, and in a production environment. The primary differences between these two environments are a) ease of setup and b) whether or not PrairieLearn is running in a Docker container.

For local development, PrairieLearn must be easy to set up; it should not require complex infrastructure or commands to run. For this use case, PrairieLearn is distributed as a single Docker container that can be run without any external dependencies.

In production, we currently run PrairieLearn outside of Docker directly on an EC2 host.

To account for the variety of contexts in which PrairieLearn is executed, there are three related but distinct ways that PrairieLearn can execute question and element code: `internal`, `native`, and `container`. These modes correspond to the `workersExecutionMode` config value. They are described in more detail below.

## `internal` execution mode

This is how PrairieLearn functioned historically. PrairieLearn would directly execute Python code with limited isolation from the rest of the system.


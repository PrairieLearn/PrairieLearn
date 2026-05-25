# Use the official GCC image to build the Landlock sandbox executable in a multi-stage build. This stage is discarded after the executable is built, so the final image does not include the GCC compiler.
FROM gcc:16 AS landlock_builder
ARG CACHEBUST=2026-04-15-14-34-07

# Copy the sandbox.c file and compile it into a Landlock-based sandbox executable
COPY sandbox.c /sandbox.c
RUN gcc -O2 -o /landlock_sandbox -Wall -Wextra -Werror /sandbox.c

FROM ubuntu:24.04
ARG CACHEBUST=2026-04-15-14-34-07

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

ENV LANG=en_US.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends make openjdk-25-jdk-headless jq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd sbuser \
    && useradd -m -g sbuser sbuser \
    # Disable ptrace mechanism to avoid heap dumping from other processes
    && echo "kernel.yama.ptrace_scope = 3" >> /etc/sysctl.d/10-ptrace.conf \
    # Delete all java.management files to hinder student's ability to retrieve information from the grader
    && rm -rf /usr/lib/jvm/java-25-openjdk-*/lib/libmanagement.so /usr/lib/jvm/java-25-openjdk-*/lib/libmanagement_agent.so /usr/lib/jvm/java-25-openjdk-*/lib/libmanagement_ext.so

COPY --from=landlock_builder /landlock_sandbox /usr/local/bin/landlock_sandbox

COPY libs /javagrader/libs
COPY JUnitAutograder.java org/prairielearn/autograder/AutograderInfo.java /javagrader/

# Compile the autograder with all warnings enabled, except for serial (missing
# serialVersionUID) and this-escape (use `this` reference in constructor)
# warnings
RUN javac -Xlint:all -Xlint:-serial -Xlint:-this-escape -Werror -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

ENTRYPOINT [ "/bin/autograder.sh" ]

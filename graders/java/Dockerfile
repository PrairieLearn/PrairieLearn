FROM ubuntu:24.04
ARG CACHEBUST=2026-02-15-14-23-34

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

COPY libs /javagrader/libs
COPY JUnitAutograder.java org/prairielearn/autograder/AutograderInfo.java /javagrader/

# Compile the autograder with all warnings enabled, except for serial (missing
# serialVersionUID) and this-escape (use `this` reference in constructor)
# warnings
RUN javac -Xlint:all -Xlint:-serial -Xlint:-this-escape -Werror -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

ENTRYPOINT [ "/bin/autograder.sh" ]

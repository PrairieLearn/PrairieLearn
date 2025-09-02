FROM ubuntu:24.04
ARG CACHEBUST=2025-08-15-14-16-03

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends make openjdk-21-jdk-headless jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8

RUN groupadd sbuser \
    && useradd -m -g sbuser sbuser \
    # Disable ptrace mechanism to avoid heap dumping from other processes
    && echo "kernel.yama.ptrace_scope = 3" >> /etc/sysctl.d/10-ptrace.conf \
    # Delete all java.management files to hinder student's ability to retrieve information from the grader
    && rm -rf /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement.so /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement_agent.so /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement_ext.so \
    mkdir /javagrader

COPY libs /javagrader/libs
COPY JUnitAutograder.java AutograderInfo.java /javagrader/

RUN javac -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

ENTRYPOINT [ "/bin/autograder.sh" ]

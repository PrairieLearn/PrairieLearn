FROM ubuntu:24.04

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y make openjdk-21-jdk-headless jq && apt-get clean

ENV LANG=en_US.UTF-8

RUN groupadd sbuser
RUN useradd -m -g sbuser sbuser

# Disable ptrace mechanism to avoid heap dumping from other processes
RUN echo "kernel.yama.ptrace_scope = 3" > cat /etc/sysctl.d/10-ptrace.conf

# Delete all java.management files to hinder student's ability to retrieve information from the grader
RUN rm -rf /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement.so /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement_agent.so /usr/lib/jvm/java-21-openjdk-amd64/lib/libmanagement_ext.so

RUN mkdir /javagrader
COPY libs /javagrader/libs
COPY JUnitAutograder.java AutograderInfo.java /javagrader/

RUN javac -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

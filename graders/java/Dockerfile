FROM ubuntu:18.04

LABEL maintainer="jonatan@cs.ubc.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y make openjdk-11-jdk-headless jq && apt clean

ENV LANG=en_US.UTF-8

RUN groupadd sbuser
RUN useradd -m -g sbuser sbuser

RUN mkdir /javagrader
COPY libs /javagrader/libs
COPY JUnitAutograder.java AutograderInfo.java /javagrader/

RUN javac -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

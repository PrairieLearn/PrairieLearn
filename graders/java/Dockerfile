FROM ubuntu:18.04

LABEL maintainer="jonatan@cs.ubc.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt update
RUN apt install -y python3.8 python3-pip make openjdk-11-jdk-headless && apt clean

RUN ln -sf /usr/bin/python3.8 /usr/bin/python3

RUN pip3 install sympy matplotlib

ENV LANG=en_US.UTF-8

ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/javagrader/

RUN groupadd sbuser
RUN useradd -g sbuser sbuser

RUN mkdir /javagrader
COPY libs /javagrader/libs
COPY JUnitAutograder.java AutograderInfo.java /javagrader/

ENV CLASSPATH=/javagrader:/javagrader/libs:/javagrader/libs/*:/grade/tests/libs:/grade/tests/libs/*:/grade/serverFilesCourse/java/libs/*:/grade/tests/junit:/grade/student

RUN javac -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

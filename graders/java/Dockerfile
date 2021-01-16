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
COPY javagrader.py /javagrader/javagrader.py
COPY libs /javagrader/libs
COPY JUnitAutograder.java /javagrader/

ENV CLASSPATH=/javagrader:/javagrader/libs/hamcrest-core-1.3.jar:/javagrader/libs/junit-4.12.jar:/javagrader/libs/json-simple-1.1.1.jar:/grade/student:/grade/tests/libs/*:/grade/serverFilesCourse/java/libs/*:/grade/tests/junit:/grade/student

RUN javac -d /javagrader /javagrader/JUnitAutograder.java

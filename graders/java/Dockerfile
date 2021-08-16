FROM ubuntu:18.04

LABEL maintainer="jonatan@cs.ubc.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y python3.8 python3-pip make openjdk-11-jdk-headless jq && apt clean

RUN ln -sf /usr/bin/python3.8 /usr/bin/python3

RUN pip3 install sympy matplotlib

ENV LANG=en_US.UTF-8

ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/javagrader/

RUN groupadd sbuser
RUN useradd -m -g sbuser sbuser

RUN mkdir /javagrader
COPY libs /javagrader/libs
COPY JUnitAutograder.java AutograderInfo.java /javagrader/

RUN javac -cp '/javagrader:/javagrader/libs:/javagrader/libs/*' -d /javagrader /javagrader/JUnitAutograder.java /javagrader/AutograderInfo.java

COPY autograder.sh /bin
RUN chmod 700 /bin/autograder.sh

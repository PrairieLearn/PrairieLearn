FROM ubuntu:18.04

LABEL maintainer="jonatan@cs.ubc.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update
RUN apt-get install -y python3.8 gcc make python3-pip valgrind check pkg-config && apt clean

RUN ln -sf /usr/bin/python3.8 /usr/bin/python3

RUN pip3 install -U pip==21.3.1

COPY requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir -r /requirements.txt

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8

ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/

RUN groupadd sbuser
RUN useradd -g sbuser sbuser

COPY cgrader /cgrader


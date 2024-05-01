FROM ubuntu:24.04

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update
RUN apt-get install -y python3.10 gcc make python3-pip valgrind check pkg-config && apt clean

RUN ln -sf /usr/bin/python3.10 /usr/bin/python3

COPY requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir -r /requirements.txt

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8

ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/:/grade/serverFilesCourse

RUN groupadd sbuser
RUN useradd -g sbuser sbuser

ENV C_INCLUDE_PATH=/cgrader

COPY cgrader /cgrader


FROM ubuntu:24.04
ARG CACHEBUST=2025-04-08-23-36-34

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3.12 gcc g++ gdb make python3-pip valgrind check pkg-config clang && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf /usr/bin/python3.12 /usr/bin/python3

COPY requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /requirements.txt

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8

ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/:/grade/serverFilesCourse

RUN groupadd sbuser && useradd -g sbuser sbuser

ENV C_INCLUDE_PATH=/cgrader

COPY cgrader /cgrader

RUN chmod 700 /cgrader/entrypoint.sh
ENTRYPOINT [ "/cgrader/entrypoint.sh" ]

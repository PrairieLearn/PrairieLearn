FROM ubuntu:24.04
ARG CACHEBUST=2025-12-15-14-21-51

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/:/grade/serverFilesCourse
ENV C_INCLUDE_PATH=/cgrader

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ gdb make valgrind check pkg-config clang python3.12 python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    # The clang Python package typically expects to see libclang.so in /usr/lib,
    # which would be the case if we installed libclang-dev, but since that
    # package is too large and mostly unnecessary, we add a symlink to the
    # existing libclang.so.1.
    && ln -s /usr/lib/llvm-18/lib/libclang.so.1 /usr/lib/libclang.so \
    && groupadd sbuser && useradd -g sbuser sbuser

COPY requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /requirements.txt

COPY cgrader /cgrader

RUN chmod 700 /cgrader/entrypoint.sh

ENTRYPOINT [ "/cgrader/entrypoint.sh" ]

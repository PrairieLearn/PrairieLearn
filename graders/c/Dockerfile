FROM ubuntu:24.04
ARG CACHEBUST=2025-04-15-14-15-50

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/:/grade/serverFilesCourse
ENV C_INCLUDE_PATH=/cgrader

RUN apt-get update \
    # The python3-clang package is installed from the Ubuntu repository instead
    # of in the pip requirements file, to ensure that the clang version of the
    # Python library matches the version of clang itself. This also ensures that
    # any dependencies that simplify the use of the library (e.g., libclang) are
    # installed and configured to be easily accessible from Python code.
    && apt-get install -y --no-install-recommends gcc g++ gdb make valgrind check pkg-config clang python3.12 python3-pip python3-clang \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && groupadd sbuser && useradd -g sbuser sbuser

COPY requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /requirements.txt

COPY cgrader /cgrader

RUN chmod 700 /cgrader/entrypoint.sh

ENTRYPOINT [ "/cgrader/entrypoint.sh" ]

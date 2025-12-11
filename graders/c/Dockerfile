FROM ubuntu:24.04
ARG CACHEBUST=2025-11-15-14-13-19

LABEL maintainer="jonatan@yorku.ca"

ARG DEBIAN_FRONTEND=noninteractive

ENV LANG=en_US.UTF-8
ENV LC_LANG=en_US.UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV PYTHONPATH=/cgrader/:/grade/serverFilesCourse
ENV C_INCLUDE_PATH=/cgrader

# - Ensure that all `uv` commands compile Python source files to bytecode.
# - Ensure that all `uv` commands do not use any caching.
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ gdb make valgrind check pkg-config clang curl ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # The clang Python package typically expects to see libclang.so in /usr/lib,
    # which would be the case if we installed libclang-dev, but since that
    # package is too large and mostly unnecessary, we add a symlink to the
    # existing libclang.so.1.
    && ln -s /usr/lib/llvm-18/lib/libclang.so.1 /usr/lib/libclang.so \
    && groupadd sbuser && useradd -g sbuser sbuser

# Install uv and Python
RUN curl -LO https://astral.sh/uv/install.sh \
    && env UV_INSTALL_DIR=/usr/local/bin sh /install.sh && rm /install.sh \
    && UV_PYTHON_BIN_DIR=/usr/local/bin uv python install python3.12

COPY requirements.txt /requirements.txt
RUN uv pip install --system -r /requirements.txt

COPY cgrader /cgrader

RUN chmod 700 /cgrader/entrypoint.sh

ENTRYPOINT [ "/cgrader/entrypoint.sh" ]

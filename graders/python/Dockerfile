FROM amazonlinux:2023
ARG CACHEBUST=2026-02-15-14-23-34

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV LANG=en_US.UTF-8

# Set uv and Python environment variables. The Python installation directory is
# set to a location that is visible to all users, since the venv is created by
# root but the autograder runs as a limited user. This setting allows Python to
# be executed both as root (e.g., for custom builds or entrypoints) and as the
# limited user (for the autograder itself).
ENV UV_PYTHON_INSTALL_DIR=/usr/local/bin
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1
ENV PATH="/venv/bin:$PATH"

WORKDIR /

RUN dnf -y update \
    && dnf install -y util-linux sudo gcc make dos2unix graphviz graphviz-devel tar \
    && dnf clean all \
    && echo "setting up uv..." \
    && curl -LO https://astral.sh/uv/install.sh \
    && UV_INSTALL_DIR=/usr/local/bin sh /install.sh && rm /install.sh \
    && uv venv --python-preference managed --python 3.13 /venv

COPY requirements.txt /
RUN uv pip install -r /requirements.txt

# Copy the source files last to speed up local dev
COPY python_autograder /python_autograder

# Anything that needs to be run post-install
RUN useradd ag && chmod +x /python_autograder/run.sh

# Add serverFilesCourse to Python path
ENV PYTHONPATH=/grade/serverFilesCourse/

ENTRYPOINT [ "/python_autograder/run.sh" ]

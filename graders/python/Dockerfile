FROM amazonlinux:2023
ARG CACHEBUST=2025-08-15-14-16-03

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV LANG=en_US.UTF-8

WORKDIR /

RUN dnf -y update \
    && dnf install -y \
    util-linux \
    sudo \
    gcc \
    make \
    dos2unix \
    graphviz \
    graphviz-devel \
    && dnf clean all \
    && echo "setting up conda..." \
    && arch="$(uname -m)" \
    && curl -LO "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh" \
    && bash "Miniforge3-Linux-${arch}.sh" -b -p /usr/local -f \
    && rm "Miniforge3-Linux-${arch}.sh"

COPY requirements.txt /
RUN python3 -m pip install --no-cache-dir -r /requirements.txt

# Copy the source files last to speed up local dev
COPY python_autograder /python_autograder

# Anything that needs to be run post-install
RUN useradd ag && chmod +x /python_autograder/run.sh

# Add serverFilesCourse to Python path
ENV PYTHONPATH=/grade/serverFilesCourse/

ENTRYPOINT [ "/python_autograder/run.sh" ]

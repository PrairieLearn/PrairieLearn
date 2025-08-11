# TODO maybe change base image? images with uv pre-installed are here
# https://docs.astral.sh/uv/guides/integration/docker/#available-images
FROM ghcr.io/astral-sh/uv:alpine
#ARG CACHEBUST=2025-07-15-14-16-18

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV LANG=en_US.UTF-8

WORKDIR /

RUN apk update \
    && apk add --no-cache \
    util-linux \
    sudo \
    build-base

# NOTE all the crap below is needed to make pygraphviz work, but we probably don't need to include this
# in the new grader image? We can add back if necessary but not sure what the use cases are.
#    dos2unix \
#    graphviz \
#    graphviz-devel

COPY requirements.txt /
RUN uv venv --seed && uv pip install --no-cache-dir -r requirements.txt

COPY run.sh /

# Anything that needs to be run post-install
# TODO Not clear yet how to make the grader run subprocess as a less privileged user
# RUN useradd ag
RUN chmod +x /run.sh

# Add serverFilesCourse to Python path
# TODO do we need to copy anything here?
ENV PYTHONPATH=/grade/serverFilesCourse/

ENTRYPOINT [ "/run.sh" ]

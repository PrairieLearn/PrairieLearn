#!/bin/bash

set -ex

# Install dependencies and various libraries.
apt-get update
apt-get -y install graphviz graphviz-dev

# Install all Python dependencies.
# Disable binary wheels for pygraphviz to avoid issues with bundled Graphviz/font stack
PIP_NO_BINARY="pygraphviz" pip3 install -r /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean && rm -rf /var/lib/apt/lists/*
pip3 cache purge

rm /requirements.txt /install.sh

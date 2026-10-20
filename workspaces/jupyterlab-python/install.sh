#!/bin/bash

set -ex

# Install dependencies and various libraries.
apt-get update
apt-get -y install graphviz graphviz-dev

# Use system Graphviz to avoid bundled font and rendering regressions.
# PyGraphviz omits Ubuntu's ARM plugin path; set it for linking and runtime.
graphviz_libdir="/usr/lib/$(gcc -print-multiarch)/graphviz"
LDFLAGS="-L${graphviz_libdir} -Wl,-rpath,${graphviz_libdir}" \
    pip3 install --no-binary=pygraphviz -r /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean && rm -rf /var/lib/apt/lists/*
pip3 cache purge

rm /requirements.txt /install.sh

#!/bin/bash

set -ex

# Install dependencies and various libraries
apt-get update && apt-get -y upgrade
apt-get -y install gcc graphviz graphviz-dev

# Install all Python dependencies.
pip3 install -r /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean
pip3 cache purge

# Delete ourself.
rm /requirements.txt /install.sh

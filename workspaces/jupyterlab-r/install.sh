#!/bin/bash

set -ex

# Install dependencies and various libraries.
apt-get update && apt-get -y upgrade

# Install all R dependencies.
xargs mamba install --yes < /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean
mamba clean --all -f -y

rm /requirements.txt /install.sh

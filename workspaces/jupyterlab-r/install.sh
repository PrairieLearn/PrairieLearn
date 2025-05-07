#!/bin/bash

set -ex

# Install all R dependencies.
xargs mamba install --yes < /requirements.txt

# Clear various caches to minimize the final image size.
mamba clean --all -f -y

rm /requirements.txt /install.sh

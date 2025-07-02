#!/bin/bash

set -ex

# Install all R dependencies.
xargs mamba install --yes r-base==4.4.3 r-irkernel==1.3.2

# Clear various caches to minimize the final image size.
mamba clean --all -f -y

rm /requirements.txt /install.sh

#!/bin/bash

set -ex

# Install all R dependencies.
mamba install -y -c conda-forge r-base=4.5.2 r-irkernel=1.3.2

# Clear various caches to minimize the final image size.
mamba clean --all -f -y

rm /install.sh

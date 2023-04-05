#!/bin/bash

yum -y update

yum install -y \
    sudo \
    gcc \
    make \
    dos2unix \
    graphviz \
    graphviz-devel

echo "setting up conda..."
cd /
arch=`uname -m`
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh
bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f

echo "installing Python packages..."
python3 -m pip install --no-cache-dir -r /requirements.txt

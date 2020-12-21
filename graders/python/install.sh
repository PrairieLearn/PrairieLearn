#!/bin/bash

yum -y update

yum install -y \
    sudo \
    gcc \
    make \
    dos2unix \
    graphviz \
    graphviz-devel

echo "setting up python3..."
cd /
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b -p /miniforge3
for f in /miniforge3/bin/* ; do [ ! -f /usr/local/bin/`basename $f` ] && ln -s $f /usr/local/bin/`basename $f` ; done # add python to path
python3 -m pip install --no-cache-dir --no-warn-script-location -r /requirements.txt
for f in /miniforge3/bin/* ; do [ ! -f /usr/local/bin/`basename $f` ] && ln -s $f /usr/local/bin/`basename $f` ; done # add new scripts to path

echo "Setting up autograder..."
useradd ag
chmod +x /python_autograder/run.sh

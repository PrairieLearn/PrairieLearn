#!/bin/bash

set -ex

# Install dependencies and various libraries
apt-get update && apt-get -y upgrade
apt-get -y install graphviz graphviz-dev
pip3 install pygraphviz

rm /install.sh

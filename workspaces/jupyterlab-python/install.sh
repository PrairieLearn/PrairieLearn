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

# Suppress the opt-in dialog for announcements.  
# https://stackoverflow.com/questions/75511508/how-to-stop-this-message-would-you-like-to-receive-official-jupyter-news
jupyter labextension disable @jupyterlab/apputils-extension:announcements

# Delete ourself.
rm /requirements.txt /install.sh

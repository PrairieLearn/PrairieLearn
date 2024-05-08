#!/bin/bash

set -ex

# This script requires root.
[ "$(id -u)" -eq 0 ] || exit 1

# On PL, we want to standardize on using 1001:1001 for the user. We change
# the "jovyan" account's default UID and GID here.
USER_NAME=jovyan
GROUP_NAME=$(id -gn $USER_NAME)
OLD_UID=$(id -u $USER_NAME)
OLD_GID=$(id -g $USER_NAME)
NEW_UID=1001
NEW_GID=1001
groupmod -g $NEW_GID $GROUP_NAME
usermod -u $NEW_UID -g $NEW_GID $USER_NAME
find /home -user $OLD_UID -execdir chown -h $NEW_UID {} +
find /home -group $OLD_GID -execdir chgrp -h $NEW_GID {} +

# Install dependencies and various libraries
apt-get update && apt-get -y upgrade
apt-get -y install gosu gcc graphviz graphviz-dev

# Test gosu and prepare the gosu helper.
gosu jovyan true || exit 1
mv /pl-gosu-helper.sh /usr/local/bin/
chown root:root /usr/local/bin/pl-gosu-helper.sh
chmod 0755 /usr/local/bin/pl-gosu-helper.sh

# Install all Python dependencies.
pip install uv
uv pip install --system -r /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean
uv cache clean
pip cache purge

# Suppress the opt-in dialog for announcements.
# https://stackoverflow.com/questions/75511508/how-to-stop-this-message-would-you-like-to-receive-official-jupyter-news
jupyter labextension disable @jupyterlab/apputils-extension:announcements

# Delete ourself.
rm /requirements.txt /install.sh

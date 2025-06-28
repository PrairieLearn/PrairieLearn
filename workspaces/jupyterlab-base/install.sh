#!/bin/bash

set -ex

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
for d in /home /tmp; do
    find $d -user $OLD_UID -execdir chown -h $NEW_UID {} +
    find $d -group $OLD_GID -execdir chgrp -h $NEW_GID {} +
done

# Install dependencies and various libraries.
apt-get update && apt-get -y upgrade
apt-get -y install gosu gcc

# Prepare the gosu helper.
mv /pl-gosu-helper.sh /usr/local/bin/
chown root:root /usr/local/bin/pl-gosu-helper.sh
chmod 0755 /usr/local/bin/pl-gosu-helper.sh

# Install all Python dependencies.
pip3 install -r /requirements.txt

# Clear various caches to minimize the final image size.
apt-get clean && rm -rf /var/lib/apt/lists/*
pip3 cache purge

# Suppress the opt-in dialog for announcements.
# https://stackoverflow.com/questions/75511508/how-to-stop-this-message-would-you-like-to-receive-official-jupyter-news
jupyter labextension disable @jupyterlab/apputils-extension:announcements

# Remove buttons and menu options that show a "shareable link".
# These confuse instructors by misleading them into thinking that a student
# would be able to access random workspaces by these links.
jupyter labextension disable @jupyterlab/filebrowser-extension:share-file
jupyter labextension disable @jupyter/collaboration-extension:shared-link

# Delete ourself.
rm /requirements.txt /install.sh

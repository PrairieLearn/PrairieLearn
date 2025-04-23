#!/bin/bash

set -ex

# This script requires root.
[ "$(id -u)" -eq 0 ] || exit 1

# On PL, we want to standardize on using 1001:1001 for the user. We change
# the "postgres" account's default UID and GID here.
USER_NAME=postgres
GROUP_NAME=$(id -gn $USER_NAME)
OLD_UID=$(id -u $USER_NAME)
OLD_GID=$(id -g $USER_NAME)
NEW_UID=1001
NEW_GID=1001
groupmod -g $NEW_GID $GROUP_NAME
usermod -u $NEW_UID -g $NEW_GID $USER_NAME
for d in /home /tmp ; do
    find $d -user $OLD_UID -execdir chown -h $NEW_UID {} +
    find $d -group $OLD_GID -execdir chgrp -h $NEW_GID {} +
done

# Install dependencies and various libraries
apt-get update && apt-get -y upgrade
apt-get -y install gosu # gcc graphviz graphviz-dev - shouldn't be needed for posgtres

# Prepare the gosu helper.
mv /pl-gosu-helper.sh /usr/local/bin/
chown root:root /usr/local/bin/pl-gosu-helper.sh
chmod 0755 /usr/local/bin/pl-gosu-helper.sh

# Delete ourself.
rm /install.sh

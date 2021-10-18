set -ex

# update base system
apt-get update && apt-get upgrade

# bring back the missing manpages
apt-get install -y man-db
yes | unminimize

# create base system
apt-get install xfce4 x11vnc novnc xvfb dbus-x11 wget nodejs npm gosu python3 -y --no-install-recommends
groupadd -g 1001 prairielearner
useradd -u 1001 -g 1001 -m -d /home/prairielearner -s /bin/bash prairielearner

# install needed apps
apt-get install xfce4-terminal firefox build-essential geany emacs-gtk vim-gtk nano gedit less -y

# install vscode
wget "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" -O /vscode.deb
apt-get install /vscode.deb -y
rm /vscode.deb

# make default folder to put config files
# (This should already have been done by the Dockerfile COPY directives.)
mkdir -p /opt/defaults

# clean up apt cache
apt-get clean
rm -rf /var/lib/apt/lists/*

# delete ourselves
rm /pre-install.sh

set -ex

# update base system
apt-get update && apt-get upgrade -y

# bring back the missing manpages
apt-get install -y man-db
yes | unminimize

# create base system
apt-get install xfce4 x11vnc novnc xvfb dbus-x11 wget nodejs npm gosu python3 -y --no-install-recommends
groupadd -g 1001 prairielearner
useradd -u 1001 -g 1001 -m -d /home/prairielearner -s /bin/bash prairielearner

# install needed apps
apt-get install xfce4-terminal build-essential geany emacs-gtk vim-gtk nano gedit less -y

# install firefox without snap (https://askubuntu.com/a/1369163)
apt-get purge firefox -y
apt-get install software-properties-common -y
add-apt-repository -y ppa:mozillateam/ppa
apt-get install firefox-esr -y

# install vscode depending on what architecture we're building on
arch=$(uname -m)
if [[ $arch == x86_64 ]]; then
    wget "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" -O /vscode.deb
elif [[ $arch == arm* ]] || [[ $arch == aarch64 ]]; then
    wget "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-arm64" -O /vscode.deb
else
    echo "Unknown architecture $arch"
    exit 1
fi
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

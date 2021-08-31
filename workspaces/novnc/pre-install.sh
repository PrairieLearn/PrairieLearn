# update base system
apt update && apt upgrade

# create base system
apt install xfce4 x11vnc novnc xvfb dbus-x11 wget nodejs npm -y --no-install-recommends
groupadd -g 1001 prairielearner
useradd -u 1001 -g 1001 -m -d /home/prairielearner -s /bin/bash prairielearner

# install needed apps
apt install xfce4-terminal firefox build-essential geany emacs-gtk vim-gtk -y

# install vscode
wget "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" -O /vscode.deb
apt install /vscode.deb -y
rm /vscode.deb

echo "root:test" | chpasswd

# delete ourselves
rm /pre-install.sh

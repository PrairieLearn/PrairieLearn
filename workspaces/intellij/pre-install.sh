#!/usr/bin/env bash
set -ex

# update base system
apt-get update && apt-get upgrade -y

# create base system
apt-get install xfce4 x11vnc novnc xvfb dbus-x11 wget nodejs npm gosu openjdk-25-jdk-headless openbox curl -y --no-install-recommends

groupadd -g 1001 prairielearner
useradd -u 1001 -g 1001 -m -d /home/prairielearner -s /bin/bash prairielearner

# make default folder to put config files
# (This should already have been done by the Dockerfile COPY directives.)
mkdir -p /opt/defaults

# clean up apt cache
apt-get clean
rm -rf /var/lib/apt/lists/*

# delete ourselves
rm /pre-install.sh

# Download and install IntelliJ IDEA Community Edition
curl -fsSL https://github.com/JetBrains/intellij-community/releases/download/idea%2F2025.3.1/idea-2025.3.1.tar.gz -o /tmp/idea.tar.gz
echo "24b4596027c3173b4c08f0b1dc25edbf8153e83a5a1be9a8df507bdfdd1d328e  /tmp/idea.tar.gz" | sha256sum -c -
tar -xzf /tmp/idea.tar.gz -C /opt/
rm /tmp/idea.tar.gz
mv /opt/idea-IC-*/ /opt/idea/

#!/usr/bin/env bash
set -ex

cp /root/.profile /home/prairielearner/.profile
cp /root/.bashrc /home/prairielearner/.bashrc
echo "export HOME=/home/prairielearner" >> /home/prairielearner/.bashrc

chown -R 1001:1001 /home/prairielearner
chown -R root:root /opt/server

npm install -g yarn
cd /opt/server && yarn install --frozen-lockfile

chmod +x /pl-gosu-helper.sh
chmod +x /start-vnc.sh

rm /post-install.sh

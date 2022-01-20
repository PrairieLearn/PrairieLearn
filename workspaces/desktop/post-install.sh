set -ex

cp /root/.profile /opt/defaults/.profile
cp /root/.bashrc /opt/defaults/.bashrc
echo "export HOME=/home/prairielearner" >> /opt/defaults/.bashrc
echo "export PATH=$PATH:/usr/lib/gcc/x86_64-linux-gnu/9/" >> /opt/defaults/.bashrc

chown -R 1001:1001 /opt/defaults
chown -R root:root /opt/server

npm install -g yarn
cd /opt/server && yarn install --frozen-lockfile

chmod +x /pl-gosu-helper.sh
chmod +x /start-vnc.sh

rm /post-install.sh

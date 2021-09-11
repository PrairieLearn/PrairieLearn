cp /root/.profile /opt/defaults/.profile
cp /root/.bashrc /opt/defaults/.bashrc
echo "export HOME=/home/prairielearner" >> /opt/defaults/.bashrc
echo "export PATH=$PATH:/usr/lib/gcc/x86_64-linux-gnu/9/" >> /opt/defaults/.bashrc

chown -R 1001:1001 /opt/defaults
chown -R root:root /opt/server

cd /opt/server && npm ci

chmod +x /pl-gosu-helper.sh
chmod +x /start-vnc.sh

rm /post-install.sh

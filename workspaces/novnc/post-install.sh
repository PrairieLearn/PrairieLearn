chown -R 1001:1001 /opt/defaults
chown -R root:root /opt/server

cd /opt/server && npm ci

chmod +x /pl-gosu-helper.sh
chmod +x /start-vnc.sh

rm /post-install.sh

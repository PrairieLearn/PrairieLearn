chown -R 1001:1001 /opt/defaults
chown -R root:root /opt/server

cd /opt/server && npm ci

rm /post-install.sh

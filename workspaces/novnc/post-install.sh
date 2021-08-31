chown -R 1001:1001 /home/prairielearner/.config
chown -R 1001:1001 /home/prairielearner/.local
chown -R root:root /opt/server

cd /opt/server && npm ci

rm /post-install.sh

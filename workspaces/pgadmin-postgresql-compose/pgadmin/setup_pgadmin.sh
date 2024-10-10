#!/bin/bash

# Wait for pgAdmin to be ready
sleep 10

# Import server configuration
python3 /pgadmin4/setup.py --load-servers /pgadmin4/servers.json

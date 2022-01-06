#!/bin/bash

# Apt dependencies
apt-get update
apt-get upgrade --yes
apt-get install --yes python3-pip gosu

# Install Python dependencies
pip install scipy numpy matplotlib pandas
rm /install.sh

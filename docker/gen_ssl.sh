#! /bin/bash

KEY=/etc/pki/tls/private/localhost.key
CERT=/etc/pki/tls/certs/localhost.crt
CA_CHAIN=/etc/pki/tls/certs/server-chain.crt

if [ -e $KEY ]; then
    exit 0
fi

openssl req -x509 -out $CERT -keyout $KEY \
    -newkey rsa:2048 -nodes -sha256 \
    -subj '/CN=localhost' -extensions EXT -config <( \
    printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")

# Make sure the file exists but can be empty
touch $CA_CHAIN

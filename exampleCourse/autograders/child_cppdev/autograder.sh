#!/bin/bash

mkdir files

sudo chown ag: files
sudo chmod -R u+rwx files

cp * files/
rm files/autograder.sh

cd files

pwd

make -j

# run the autograder as non-root
# THIS IS IMPORTANT
# for testing purposes we do the piping ourselves
sudo -H -u ag bash -c './tester > out.txt'


cp out.txt /autograder_results/result.json
#cat ./out.txt

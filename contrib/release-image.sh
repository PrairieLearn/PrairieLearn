#!/bin/bash

while getopts ":t:" o; do
    case "${o}" in
    t)
        t=${OPTARG}
        ;;
    *)
        usage
        ;;
    esac
done

shift $(($OPTIND - 1))

if [ "$#" -ne 1 ]; then
  echo "USAGE: $0 [-t tag] image_name" >& 2
  echo "image_name should correspond to directory images/image_name"
  exit 1
fi

if [ ! -d "images/$1/" ]; then
  echo "ERR: images/$1 does not exist" >& 2
  exit 2
fi

if [ ! -f "images/$1/Dockerfile" ]; then
  echo "ERR: images/$1/Dockerfile does not exist" >& 2
  exit 3
fi

if [ -z "${t}" ]; then
    while true; do
        read -p "No tag specified; using \"latest\" by default. Continue? (y/n): " yn
        case $yn in
            [Yy]* ) break;;
            [Nn]* ) exit;;
            * ) echo "Please answer yes or no. ";;
        esac
    done
    t="latest"
fi

cd images/$1/
docker buildx build --push --platform linux/arm64/v8,linux/amd64 -t prairielearn/$1:${t} .

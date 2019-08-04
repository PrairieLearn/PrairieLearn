FROM node:12-alpine AS builder
WORKDIR /app
COPY package* ./
RUN npm install
COPY ./ ./
RUN npm run clean
RUN npm run build

FROM ubuntu:18.04
RUN apt-get update && apt-get install -y python3 python3-dev python3-pip curl graphviz graphviz-dev && curl -sL https://deb.nodesource.com/setup_12.x | bash - && apt-get install -y nodejs
# RUN apk add python3-dev freetype-dev libpng-dev libxml2-dev libxslt-dev openblas-dev gfortran make automake gcc g++
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r ./requirements.txt
COPY --from=builder /app/package* ./
RUN npm install --production
COPY --from=builder /app/dist ./dist/
CMD npm --silent start

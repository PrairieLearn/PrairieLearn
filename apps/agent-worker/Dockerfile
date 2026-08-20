FROM docker.io/cloudflare/sandbox:0.13.0-next.738.2

WORKDIR /opt/prairielearn-agent
COPY sandbox/package.json sandbox/package-lock.json /opt/prairielearn-agent/
RUN npm ci --omit=dev

WORKDIR /workspace

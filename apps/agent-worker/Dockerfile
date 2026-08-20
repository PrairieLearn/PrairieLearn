FROM docker.io/cloudflare/sandbox:0.13.0-next.738.2

WORKDIR /opt/prairielearn-agent
COPY sandbox/package.json sandbox/package-lock.json /opt/prairielearn-agent/
RUN npm ci --omit=dev
COPY sandbox/*.mjs /opt/prairielearn-agent/
RUN groupadd --system prairie-agent \
  && useradd --system --gid prairie-agent --home-dir /nonexistent --shell /usr/sbin/nologin prairie-agent \
  && git config --system --add safe.directory /workspace/course \
  && chmod -R a-w /opt/prairielearn-agent

WORKDIR /workspace

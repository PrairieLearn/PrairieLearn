FROM docker.io/cloudflare/sandbox:1.0.2 AS tools
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps zstd tini && rm -rf /var/lib/apt/lists/*
RUN npm install --global @openai/codex@0.163.0
COPY --from=tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY container/relay.mjs /opt/course-agent/relay.mjs
RUN mkdir -p /workspace && chown node:node /workspace
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]

FROM docker.io/cloudflare/sandbox:1.0.2 AS tools
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps zstd tini && rm -rf /var/lib/apt/lists/*
# Run the native binary directly so the review writer check sees only Codex, without its Node launcher.
RUN npm install --global @openai/codex@0.163.0 \
    && find /usr/local/lib/node_modules/@openai/codex -type f -path '*/vendor/*/bin/codex' -exec ln -sf '{}' /usr/local/bin/codex \; \
    && codex --version
COPY --from=tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN mkdir -p /workspace && chown node:node /workspace
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]

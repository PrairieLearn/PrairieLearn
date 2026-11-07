FROM docker.io/cloudflare/sandbox:1.0.2 AS tools
FROM node:24-bookworm-slim
ARG CACHEBUST=2026-09-15-14-09-16
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps zstd tini && rm -rf /var/lib/apt/lists/*
# Without an identity, Git guesses one from the hostname with a DNS lookup that times out in the
# offline sandbox, stalling every command that writes a commit or reflog (about 28 s per clone).
RUN git config --system user.name "PrairieLearn" && git config --system user.email "course-agent@prairielearn.com"
RUN npm install --global @openai/codex@0.163.0
COPY --from=tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN mkdir -p /workspace && chown node:node /workspace
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]

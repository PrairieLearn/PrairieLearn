FROM docker.io/cloudflare/sandbox:1.0.2 AS sandbox

# Cloudflare Containers run linux/amd64. Only Codex's native binary and helpers are needed; the
# @openai/codex npm package is a Node launcher for them.
FROM debian:bookworm-slim AS codex
ADD --checksum=sha256:30efc97738b975940d78b59a9bea115fa34040b732807d54ec35ae6b7528de94 \
  https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-linux-x64.tgz /tmp/codex.tgz
# Voice support is unused and is the largest helper.
RUN tar -xzf /tmp/codex.tgz -C /tmp \
  && mv /tmp/package/vendor/x86_64-unknown-linux-musl /opt/codex \
  && rm -rf /opt/codex/codex-resources/voice

FROM debian:bookworm-slim
ARG CACHEBUST=2026-09-15-14-09-16
# Without an identity, Git guesses one from the hostname with a DNS lookup that times out in the
# offline sandbox, stalling every command that writes a commit or reflog (about 28 s per clone).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates ripgrep jq procps zstd tini \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system user.name "PrairieLearn" \
  && git config --system user.email "course-agent@prairielearn.com" \
  && useradd --uid 1000 --user-group --shell /bin/bash node \
  && mkdir -p /workspace \
  && chown node:node /workspace
COPY --from=codex /opt/codex /opt/codex
RUN ln -s /opt/codex/bin/codex /usr/local/bin/codex
COPY --from=sandbox /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY codex-config.toml /etc/course-agent/codex-config.toml
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]

FROM docker.io/cloudflare/sandbox:1.0.2 AS sandbox

# Cloudflare Containers run linux/amd64. The sandbox only runs Codex's app server, so it uses the
# release's app-server package: the server, its code-mode host, ripgrep, and bubblewrap. Update
# the version and checksum together; the checksum is the asset's digest on its GitHub release.
FROM debian:bookworm-slim AS codex
ADD --checksum=sha256:cce5802264a44d082da894ff2f2ba695a6ade722bc62a1ad0902153667063401 \
  https://github.com/openai/codex/releases/download/rust-v0.163.0/codex-app-server-package-x86_64-unknown-linux-musl.tar.gz /tmp/codex.tgz
RUN mkdir /opt/codex && tar -xzf /tmp/codex.tgz -C /opt/codex

FROM debian:bookworm-slim
ARG CACHEBUST=2026-09-15-14-09-16
# Python with pandas and numpy lets the agent analyze course data. Agents often run `python`, so
# python-is-python3 provides it. tzdata provides timezone rules for converting UTC timestamps; the
# slim base image does not include them.
# Without an identity, Git guesses one from the hostname with a DNS lookup that times out in the
# offline sandbox, stalling every command that writes a commit or reflog (about 28 s per clone).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates ripgrep jq procps zstd tini poppler-utils \
    python3 python-is-python3 python3-pandas python3-numpy tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system user.name "PrairieLearn" \
  && git config --system user.email "course-agent@prairielearn.com" \
  && useradd --uid 1000 --user-group --shell /bin/bash agent \
  && mkdir -p /workspace /uploads \
  && chown agent:agent /workspace
COPY --from=codex /opt/codex /opt/codex
RUN ln -s /opt/codex/bin/codex-app-server /usr/local/bin/codex-app-server
COPY --from=sandbox /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY codex-config.toml /etc/course-agent/codex-config.toml
# Codex loads skills from /etc/codex/skills (its admin scope): read-only for the agent and outside
# the checkpointed workspace, so each sandbox gets this image's version.
COPY skills /etc/codex/skills
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]

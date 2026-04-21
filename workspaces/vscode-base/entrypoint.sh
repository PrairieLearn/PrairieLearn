#! /bin/bash

# If networking is disabled, disable the extensions gallery to avoid a query in
# the client. Without this check, if the workspace has networking disabled, the
# client will still be allowed to search for extensions using client-side
# queries, but since extensions are installed server-side, the installation will
# fail. With this check, the client will not be able to search for extensions,
# which avoids confusion. This check is done when the entrypoint is called
# instead of in the Dockerfile because the server may be started with networking
# enabled or disabled, and we want to support both cases without requiring a
# custom image. Also, Dockerfiles for child images should still be able to
# install extensions from the marketplace during build time, which requires the
# gallery to be enabled.
#
# This check is based on workspace settings. If networking is restricted through
# other means (e.g., the gallery URL is blocked or unavailable), we don't handle
# that case explicitly for simplicity.
[[ -n "${WORKSPACE_NETWORKING_DISABLED}" ]] && export EXTENSIONS_GALLERY="{}"
exec /usr/bin/entrypoint.sh --auth none --disable-update-check --disable-telemetry --bind-addr 0.0.0.0:8080 . "$@"

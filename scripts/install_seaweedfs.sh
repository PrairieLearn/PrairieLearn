#!/bin/bash
set -euo pipefail

version=4.55
install_dir=${SEAWEEDFS_INSTALL_DIR:-"$PWD/.local/bin"}
if [[ -x "$install_dir/weed" ]] && "$install_dir/weed" version | grep -q "version .* $version "; then
    exit 0
fi

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)
        platform=linux_amd64
        checksum=f156c609eeaf9e5fcfeea33fd70411222005f83760aa95893c9d58eff006b45c
        ;;
    Linux-aarch64 | Linux-arm64)
        platform=linux_arm64
        checksum=ced87c09a2a5e87c7c94fd25e36c421670b97fded064026738a69f13ee8c7b96
        ;;
    Darwin-x86_64)
        platform=darwin_amd64
        checksum=8dcd08c745157fc11a4c066e5f34968736495a4ab1ed252b690652be697faea4
        ;;
    Darwin-arm64)
        platform=darwin_arm64
        checksum=f2cc8368d4dc50265390803efd70e6ba77c242962902bd81a5e9520f0d262eca
        ;;
    *)
        if command -v weed > /dev/null; then
            exit 0
        fi
        echo "No SeaweedFS binary is available for $(uname -s)-$(uname -m). Install weed on PATH." >&2
        exit 1
        ;;
esac

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
archive="${platform}.tar.gz"
curl -fsSL "https://github.com/seaweedfs/seaweedfs/releases/download/${version}/${archive}" -o "$tmp_dir/$archive"
if command -v sha256sum > /dev/null; then
    actual_checksum=$(sha256sum "$tmp_dir/$archive" | cut -d ' ' -f 1)
else
    actual_checksum=$(shasum -a 256 "$tmp_dir/$archive" | cut -d ' ' -f 1)
fi
if [[ "$actual_checksum" != "$checksum" ]]; then
    echo "SeaweedFS archive checksum verification failed." >&2
    exit 1
fi
tar -xzf "$tmp_dir/$archive" -C "$tmp_dir" weed
mkdir -p "$install_dir"
install -m 755 "$tmp_dir/weed" "$install_dir/weed"

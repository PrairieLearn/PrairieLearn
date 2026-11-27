#!/bin/bash
set -euo pipefail

version=1.0.7
install_dir=${RUSTFS_INSTALL_DIR:-"$PWD/.local/bin"}
if [[ -x "$install_dir/rustfs" ]] && [[ $("$install_dir/rustfs" --version) == "rustfs $version"$'\n'* ]]; then
    exit 0
fi

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)
        platform=linux-x86_64-musl
        checksum=c90a40ba8cdc1468c71029a4d65fdd13449720183d3a8e00bc61ab09fcd448a5
        ;;
    Linux-aarch64 | Linux-arm64)
        platform=linux-aarch64-musl
        checksum=e2c6d45105dd05df2f35547fbebfacf40dfba6ec4f8c31b86e30934faea79e76
        ;;
    Darwin-arm64)
        platform=macos-aarch64
        checksum=4b8c7cf06c9b1c640bf48efdb92f0ab6857cac2836f591f3642c81d2d2f0813f
        ;;
    *)
        if command -v rustfs > /dev/null; then
            exit 0
        fi
        echo "No RustFS binary is available for $(uname -s)-$(uname -m). Install rustfs on PATH." >&2
        exit 1
        ;;
esac

archive="rustfs-${platform}-v${version}.zip"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

curl -fsSL "https://github.com/rustfs/rustfs/releases/download/${version}/${archive}" -o "$tmp_dir/$archive"
if command -v sha256sum > /dev/null; then
    actual_checksum=$(sha256sum "$tmp_dir/$archive" | cut -d ' ' -f 1)
else
    actual_checksum=$(shasum -a 256 "$tmp_dir/$archive" | cut -d ' ' -f 1)
fi
if [[ "$actual_checksum" != "$checksum" ]]; then
    echo "RustFS archive checksum verification failed." >&2
    exit 1
fi
unzip -q "$tmp_dir/$archive" -d "$tmp_dir"
mkdir -p "$install_dir"
install -m 755 "$tmp_dir/rustfs" "$install_dir/rustfs"

#!/bin/bash
set -euo pipefail

# Usage: ./scripts/install-print-pdf-tools.sh [install-directory]
# Requires a JDK >= 17, curl, and OpenSSL. Set JAVA_HOME if necessary.
# PRINT_PDF_TOOLS_CACHE can supply the pinned PDFBox JAR without network access.

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
install_dir=${1:-"$repo_dir/.local/print-pdf-tools"}
java_bin=${JAVA_HOME:+"$JAVA_HOME/bin/"}java
javac_bin=${JAVA_HOME:+"$JAVA_HOME/bin/"}javac
pdfbox_version=3.0.8

javac_version=$("$javac_bin" -version 2>&1)
javac_major=${javac_version#javac }
javac_major=${javac_major%%.*}
if [[ ! $javac_major =~ ^[0-9]+$ ]] || ((javac_major < 17)); then
    echo "A JDK >= 17 is required; found $javac_version." >&2
    exit 1
fi

if [[ -e "$install_dir" ]]; then
    echo "Install directory already exists: $install_dir" >&2
    exit 1
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

filename="pdfbox-app-$pdfbox_version.jar"
if [[ -n ${PRINT_PDF_TOOLS_CACHE:-} ]]; then
    cp "$PRINT_PDF_TOOLS_CACHE/$filename" "$work_dir/$filename"
else
    curl --fail --location --retry 3 --output "$work_dir/$filename" \
        "https://archive.apache.org/dist/pdfbox/$pdfbox_version/$filename"
fi
actual_sha512=$(openssl dgst -sha512 "$work_dir/$filename")
if [[ ${actual_sha512##* } != '768847238f683568507bf73570a2b6fedcbe58b25c7b4f97fba536ba110b290fe96ba065aed58629d41fb94857d76bc1978c2f31d294b553c69f287f71ee9600' ]]; then
    echo "SHA-512 verification failed: $filename" >&2
    exit 1
fi

mkdir -p "$install_dir"
cp "$work_dir/$filename" "$install_dir/"
"$java_bin" -Djava.awt.headless=true -jar "$install_dir/$filename" version
echo "Installed PDFBox in $install_dir"

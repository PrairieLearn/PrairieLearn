#!/bin/bash
set -euo pipefail

# Usage: ./scripts/install-print-pdf-tools.sh [install-directory]
# Requires a JDK >= 17, curl, unzip, and OpenSSL. Set JAVA_HOME if necessary.
# PRINT_PDF_TOOLS_CACHE can supply the two pinned archives without network access.

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
install_dir=${1:-"$repo_dir/.local/print-pdf-tools"}
java_bin=${JAVA_HOME:+"$JAVA_HOME/bin/"}java
javac_bin=${JAVA_HOME:+"$JAVA_HOME/bin/"}javac
pdfbox_version=3.0.8
verapdf_version=1.30.3

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

download() {
    local name=$1 url=$2 expected_sha512=$3 actual_sha512
    if [[ -n ${PRINT_PDF_TOOLS_CACHE:-} ]]; then
        cp "$PRINT_PDF_TOOLS_CACHE/$name" "$work_dir/$name"
    else
        curl --fail --location --retry 3 --output "$work_dir/$name" "$url"
    fi
    actual_sha512=$(openssl dgst -sha512 "$work_dir/$name")
    if [[ ${actual_sha512##* } != "$expected_sha512" ]]; then
        echo "SHA-512 verification failed: $name" >&2
        exit 1
    fi
}

download "pdfbox-app-$pdfbox_version.jar" \
    "https://archive.apache.org/dist/pdfbox/$pdfbox_version/pdfbox-app-$pdfbox_version.jar" \
    '768847238f683568507bf73570a2b6fedcbe58b25c7b4f97fba536ba110b290fe96ba065aed58629d41fb94857d76bc1978c2f31d294b553c69f287f71ee9600'
download "verapdf-greenfield-$verapdf_version-installer.zip" \
    "https://software.verapdf.org/releases/1.30/verapdf-greenfield-$verapdf_version-installer.zip" \
    '4a539212c32acbc8cefcae25e94bbcd4dc5a875439e8148e0b208947beceb7ab86d489276ca9f4e6b3ff4a5b4594f49dc175b57819045b54d620a79fcece0f13'

mkdir -p "$install_dir"
install_dir=$(cd "$install_dir" && pwd)
cp "$work_dir/pdfbox-app-$pdfbox_version.jar" "$install_dir/"
unzip -q "$work_dir/verapdf-greenfield-$verapdf_version-installer.zip" -d "$work_dir"
xml_install_dir=$(printf '%s' "$install_dir/verapdf" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
cat > "$work_dir/install.xml" << EOF
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
    <installpath>$xml_install_dir</installpath>
  </com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
    <pack index="0" name="veraPDF GUI" selected="false"/>
    <pack index="1" name="veraPDF CLI" selected="true"/>
    <pack index="2" name="veraPDF Documentation" selected="false"/>
    <pack index="3" name="veraPDF Sample Plugins" selected="false"/>
  </com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
EOF

"$java_bin" -Djava.awt.headless=true -jar \
    "$work_dir/verapdf-greenfield-$verapdf_version/verapdf-izpack-installer-$verapdf_version.jar" \
    "$work_dir/install.xml"
"$java_bin" -Djava.awt.headless=true -jar "$install_dir/pdfbox-app-$pdfbox_version.jar" version
"$install_dir/verapdf/verapdf" --version
echo "Installed print PDF tools in $install_dir"

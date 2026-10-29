#!/bin/bash
set -euo pipefail

# Optional local validation only; production and CI do not install this tool.
# Usage: ./scripts/install-print-pdf-validator.sh [install-directory]
# Requires Java, curl, unzip, OpenSSL, and which. Set JAVA_HOME if necessary.
# PRINT_PDF_TOOLS_CACHE can supply the pinned installer ZIP without network access.

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
install_dir=${1:-"$repo_dir/.local/print-pdf-validator"}
java_bin=${JAVA_HOME:+"$JAVA_HOME/bin/"}java
verapdf_version=1.30.3
"$java_bin" -version

if [[ -e "$install_dir" ]]; then
    echo "Install directory already exists: $install_dir" >&2
    exit 1
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

filename="verapdf-greenfield-$verapdf_version-installer.zip"
if [[ -n ${PRINT_PDF_TOOLS_CACHE:-} ]]; then
    cp "$PRINT_PDF_TOOLS_CACHE/$filename" "$work_dir/$filename"
else
    curl --fail --location --retry 3 --output "$work_dir/$filename" \
        "https://software.verapdf.org/releases/1.30/$filename"
fi
actual_sha512=$(openssl dgst -sha512 "$work_dir/$filename")
if [[ ${actual_sha512##* } != '4a539212c32acbc8cefcae25e94bbcd4dc5a875439e8148e0b208947beceb7ab86d489276ca9f4e6b3ff4a5b4594f49dc175b57819045b54d620a79fcece0f13' ]]; then
    echo "SHA-512 verification failed: $filename" >&2
    exit 1
fi

mkdir -p "$install_dir"
install_dir=$(cd "$install_dir" && pwd)
unzip -q "$work_dir/$filename" -d "$work_dir"
xml_install_dir=$(printf '%s' "$install_dir" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
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
version=$("$install_dir/verapdf" --version)
if [[ ${version%%$'\n'*} != "veraPDF $verapdf_version" ]]; then
    echo "Unexpected veraPDF version: $version" >&2
    exit 1
fi
echo "Installed veraPDF $verapdf_version in $install_dir for optional local validation"

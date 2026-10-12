#!/bin/zsh
# Builds "Cowork Exporter.app" (unsigned AppleScript-JS applet) and a zip to send.
set -e
cd "$(dirname "$0")"
rm -rf "Cowork Exporter.app" "Cowork Exporter.zip"
osacompile -l JavaScript -o "Cowork Exporter.app" cowork-exporter.js
ditto -c -k --keepParent "Cowork Exporter.app" "Cowork Exporter.zip"
echo "Built Cowork Exporter.app and Cowork Exporter.zip"

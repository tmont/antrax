#!/usr/bin/env bash

set -euo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rootDir=$(dirname "$(dirname "${thisDir}")")
readonly thisDir rootDir

awk -f "${thisDir}"/rgb-to-json.awk "${thisDir}"/rgb.txt > "${rootDir}"/colors.json

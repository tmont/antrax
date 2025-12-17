#!/usr/bin/env bash

set -euo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rootDir=$(dirname "${thisDir}")

readonly thisDir rootDir

main() {
    SECONDS=0

    local svgDir="${rootDir}/public/images/svg"
    local indexHtml="${rootDir}/public/index.html"

    local sprite=
    local svgFile=
    local indent="            "
    local svgIndent="        "

    for svgFile in "${svgDir}"/*; do
        echo "processing ${svgFile}"
        local bname=
        bname=$(basename "${svgFile}")
        local id="svg-${bname%.*}"
        sprite="${sprite}${indent}$(perl -p -e "s/<svg/<symbol id=\"${id}\"/" "${svgFile}" | perl -p -e "s#</svg>#</symbol>#")"$'\n'
    done

    echo "replacing svg sprite in ${indexHtml}..."
    perl -0 -p -i -e "s%(<svg id=\"svg-sprite\".*?>).*?</svg>%\$1"$'\n'"${sprite}${svgIndent}</svg>%s" "${indexHtml}"

    echo "all done in ${SECONDS}s"
}

main "$@"

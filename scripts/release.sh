#!/usr/bin/env bash

set -euo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rootDir=$(dirname "${thisDir}")
releaseDir="${rootDir}/.dev/release"

readonly thisDir rootDir releaseDir

main() {
    SECONDS=0

    if [[ ! -d "${releaseDir}" ]]; then
        mkdir -v -p "${releaseDir}"
    fi

    (
        cd "${rootDir}"

        bun run lint

        bun build \
            --outfile "${releaseDir}/public/app.js" \
            --target browser \
            --minify \
            public/app.ts

        "${rootDir}"/.dev/dart-sass/sass \
            --no-source-map \
            "${rootDir}/public/app.scss" \
            "${releaseDir}/public/app.css"

        cp -v -R \
          "${rootDir}/public/index.html" \
          "${rootDir}/public/fonts/" \
          "${rootDir}/public/images/" \
          "${releaseDir}/public"
    )

    local envFile="${rootDir}/.dev/.env"
    . "${envFile}"

    if [[ -z "${RELEASE_REMOTE_HOST}" || -z "${RELEASE_REMOTE_DIR}" ]]; then
        echo "${envFile} is not properly populated"
        exit 1
    fi

    echo "sending files to ${RELEASE_REMOTE_HOST}..."
    rsync -vaz --delete "${releaseDir}/public/" "${RELEASE_REMOTE_HOST}":"${RELEASE_REMOTE_DIR}"

    echo "all done in ${SECONDS}s"
}

main "$@"

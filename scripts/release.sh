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
            --outdir "${releaseDir}/public/" \
            --target=browser \
            --sourcemap=linked \
            --minify \
            --keep-names \
            public/app.ts

        "${rootDir}"/.dev/dart-sass/sass \
            --no-source-map \
            "${rootDir}/public/app.scss" \
            "${releaseDir}/public/app.css"

        echo "copying files to ${releaseDir}..."
        cp -R \
          "${rootDir}/public/index.html" \
          "${rootDir}/public/fonts/" \
          "${rootDir}/public/images/" \
          "${rootDir}/public/assets/" \
          "${releaseDir}/public"

        local changelogContent
        changelogContent=$(pandoc -f markdown-auto_identifiers -t html "${rootDir}/CHANGELOG.md")

        local nextVersion="" currentVersion
        currentVersion=$(bun -e "import pkg from './package.json'; console.log(pkg.version);")

        while [[ -z "${nextVersion}" ]]; do
            echo -n "new version number (current: ${currentVersion}): "
            read -r nextVersion
            echo
        done

        local gitRevision
        gitRevision=$(git log -n 1 --pretty='%h')

        perl -p -i -e "s/\\\$VERSION\\\$/${nextVersion}/" "${releaseDir}/public/index.html"
        perl -p -i -e "s/\\\$COMMIT\\\$/${gitRevision}/" "${releaseDir}/public/index.html"
        perl -p -i -e "s^\\\$CHANGELOG\\\$^${changelogContent}^" "${releaseDir}/public/index.html"

        echo "writing new version to package.json..."
        bun -e "import pkg from './package.json'; pkg.version = '${nextVersion}'; Bun.write('./package.json', JSON.stringify(pkg, null, '    ') + '\n');"

        git commit -m "release v${nextVersion}" CHANGELOG.md package.json
        git tag -a "v${nextVersion}" -m "v${nextVersion}"
    )

    local envFile="${rootDir}/.dev/.env"
    # shellcheck source=../.dev/.env
    . "${envFile}"

    if [[ -z "${RELEASE_REMOTE_HOST}" || -z "${RELEASE_REMOTE_DIR}" ]]; then
        echo "${envFile} is not properly populated"
        exit 1
    fi

    echo "sending files to ${RELEASE_REMOTE_HOST}..."
    rsync -az --info=name1 --delete "${releaseDir}/public/" "${RELEASE_REMOTE_HOST}":"${RELEASE_REMOTE_DIR}"

    echo "all done in ${SECONDS}s"
}

main "$@"

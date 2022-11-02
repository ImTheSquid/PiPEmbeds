#!/bin/sh

if [ "$(uname)" == "Darwin" ]; then
    alias sed="gsed"
fi

# ESBuild
esbuild ./src/PiPEmbeds/index.jsx --bundle --outfile=src/PiPEmbeds/build/bundled.js --platform=node --external:electron

# Move the module.exports to the top of the file to make sure the bundled code is included
sed -i '/module\.exports = (Plugin, Library) => {/d' src/PiPEmbeds/build/bundled.js
sed -i '1imodule.exports = (Plugin, Library) => {' src/PiPEmbeds/build/bundled.js

zpl build PiPEmbeds
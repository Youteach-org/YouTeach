#!/bin/sh
set -eu

rm -rf dist
mkdir -p dist

for file in *.html *.js *.mjs *.css; do
  if [ -f "$file" ]; then
    cp "$file" dist/
  fi
done

echo "Prepared Cloudflare Pages static output in ./dist"

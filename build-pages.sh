#!/bin/sh
set -eu

rm -rf dist
mkdir -p dist

for file in *.html *.js *.css; do
  if [ -f "$file" ]; then
    cp "$file" dist/
  fi
done

for control_file in _headers _redirects; do
  if [ -f "$control_file" ]; then
    cp "$control_file" dist/
  fi
done

echo "Prepared Cloudflare Pages static output in ./dist"

#!/bin/bash
# Double-click in Finder to install frontend packages and start the web app.
set -e
cd "$(dirname "$0")/frontend"
echo "== Installing frontend packages (includes the map library)"
npm install
echo; echo "== Starting the web app on http://localhost:5173  (Ctrl+C to stop)"
npm run dev

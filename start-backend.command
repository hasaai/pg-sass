#!/bin/bash
# Double-click in Finder to install backend packages, update the database and start Django.
# Stop the server with Ctrl+C (or close this window).
set -e
cd "$(dirname "$0")/backend"

if [ ! -d .venv ]; then
  echo "Creating the Python virtual environment…"
  python3 -m venv .venv
fi
source .venv/bin/activate

echo; echo "== 1/4 Installing Python packages (includes Pillow)"
pip install --upgrade pip -q
pip install -r requirements-dev.txt
python -c "import PIL; print('Pillow', PIL.__version__, 'OK')"

echo; echo "== 2/4 Updating the database"
python manage.py migrate

echo; echo "== 3/4 Demo data: skipped (the database is left as it is)."
echo "   To load demo data instead: python manage.py seed_demo --fresh"

echo; echo "== 4/4 Starting the API on http://127.0.0.1:8000  (Ctrl+C to stop)"
echo "Then start the frontend (start-frontend.command) and open http://localhost:5173"
python manage.py runserver

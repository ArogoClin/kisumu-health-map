#!/bin/sh
set -e  # Exit on any error

PORT=${PORT:-8080}

# Check if tables already exist (from your local.sql)
if ! psql "$SUPABSE_DB_URL" -c "\dt kenya_counties" >/dev/null 2>&1; then
    echo "Applying initial migrations..."
    python manage.py migrate --noinput
else
    echo "Database already populated - skipping migrations"
    # Fake migrations to align Django's state
    python manage.py migrate --fake --noinput  
fi

# Start server
exec gunicorn \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    HealthMapper.wsgi:application
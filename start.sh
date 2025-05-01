#!/bin/sh

# Set default port if not specified
PORT=${PORT:-8080}

# Run migrations (if needed)
python manage.py migrate --noinput

# Start Gunicorn
exec gunicorn \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    HealthMapper.wsgi:application
#!/bin/bash

# Exit immediately if any command fails
set -e

# 1. Run database migrations
python manage.py migrate --noinput

# 2. Add cron jobs (if needed)
# python manage.py crontab add

# 3. Start Celery services (only if you need them)
# celery -A HealthMapper worker --pool=solo -l info &
# celery -A HealthMapper beat -l info &

# 4. Start Gunicorn (CRITICAL FIX - using $PORT)
exec gunicorn HealthMapper.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 120 \
    --workers 2 \
    --access-logfile -
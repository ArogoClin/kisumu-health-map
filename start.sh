#!/bin/bash

# Exit immediately if any command fails
set -e

# 1. Install wait-for-it (alternative to netcat)
if ! command -v wait-for-it &> /dev/null; then
    echo "Installing wait-for-it..."
    pip install wait-for-it
fi

# 2. Wait for database (using Python-based check)
echo "Waiting for database..."
python << END
import os, sys, time, psycopg2
from psycopg2 import OperationalError

db_host = os.getenv('SUPABASE_DB_HOST')
db_port = os.getenv('SUPABASE_DB_PORT', '5432')
max_retries = 30
retry_delay = 2

for i in range(max_retries):
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            user=os.getenv('SUPABASE_DB_USER'),
            password=os.getenv('SUPABASE_DB_PASSWORD'),
            connect_timeout=3
        )
        conn.close()
        print("Database connection successful!")
        sys.exit(0)
    except OperationalError as e:
        print(f"Attempt {i+1}/{max_retries} failed: {e}")
        if i < max_retries - 1:
            time.sleep(retry_delay)

print("Failed to connect to database after maximum retries")
sys.exit(1)
END

# 3. Run migrations
python manage.py migrate --noinput

# 4. Start Gunicorn
exec gunicorn HealthMapper.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 120 \
    --workers 2 \
    --access-logfile -
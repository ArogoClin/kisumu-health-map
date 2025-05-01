FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    gdal-bin \
    libgdal-dev \
    binutils \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

# GDAL environment variables
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV LIBRARY_PATH=/usr/lib

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application (ensure .sh files have LF line endings)
COPY . .

# Create entrypoint with proper Unix line endings
RUN echo -e '#!/bin/sh\n\
python manage.py migrate --noinput\n\
exec "$@"' > /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    dos2unix /entrypoint.sh  # Convert line endings

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:${PORT:-8000}", "--timeout", "120", "HealthMapper.wsgi:application"]
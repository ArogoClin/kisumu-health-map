# Use the same Python version as your working project
FROM python:3.9-slim

# Install system dependencies (combining both approaches)
RUN apt-get update && apt-get install -y \
    build-essential \
    gdal-bin \
    libgdal-dev \
    binutils \
    libproj-dev \
    proj-bin \
    # Adding WeasyPrint dependencies for compatibility
    gobject-introspection \
    libgirepository-1.0-1 \
    libcairo2 \
    libpango1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set comprehensive GDAL environment variables
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV PROJ_LIB=/usr/share/proj
ENV GDAL_DATA=/usr/share/gdal
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Collect static files during build
RUN python manage.py collectstatic --noinput

# Use the start.sh approach from your working project
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Use the PORT handling from your current project
CMD ["sh", "-c", "/start.sh"]
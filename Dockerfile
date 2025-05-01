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

# Copy application files (including start.sh)
COPY . .

# Set execute permissions and convert line endings
RUN chmod +x /app/start.sh && \
    sed -i 's/\r$//' /app/start.sh  # Remove Windows line endings if present

# Run the application
CMD ["/app/start.sh"]
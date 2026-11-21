#!/bin/sh
set -e

# Ensure directories exist with restricted permissions on DB data directory
mkdir -p /app/audio /app/data
chmod 700 /app/data 2>/dev/null || true
chmod -R 777 /app/audio 2>/dev/null || true

exec "$@"

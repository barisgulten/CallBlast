FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation and ffmpeg for audio conversion
RUN apk add --no-cache python3 make g++ ffmpeg

# Create directories for audio files and database
RUN mkdir -p /app/audio /app/data

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code and entrypoint
COPY . .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose server port
EXPOSE 3000

# Start server via entrypoint to fix volume permissions on startup
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/index.js"]

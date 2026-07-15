# Stage 1: Build the frontend static assets
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Run the Express backend serving static assets
FROM node:20-alpine
WORKDIR /app

# Install git and openssh (needed for git commands and SSH key authentications)
RUN apk add --no-cache git openssh-client

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

# Copy backend source code and build it
COPY backend/ ./
RUN npm run build

# Copy compiled frontend assets to backend public directory
COPY --from=frontend-builder /app/frontend/dist /app/backend/public

# Expose server port
EXPOSE 3000

# Set environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DB_DIR=/root/.marginalia

# Start server
CMD ["node", "--experimental-sqlite", "dist/server.js"]
FROM node:22-alpine
ENV NODE_OPTIONS="--max-old-space-size=512"
WORKDIR /app

# Install git, openssh, gocryptfs, and fuse (needed for git commands and encrypted VFS mounting)
RUN apk add --no-cache git openssh-client gocryptfs fuse

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN [ -f package-lock.json ] && sed -i 's|https://us-npm.pkg.dev/artifact-foundry-prod/ah-3p-staging-npm/|https://registry.npmjs.org/|g' package-lock.json || true
RUN npm ci

# Copy backend source code and build it
COPY backend/ ./
RUN npm run build

# Copy CHANGELOG.md
COPY CHANGELOG.md /app/CHANGELOG.md

# Expose server port
EXPOSE 3000

# Set environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DB_DIR=/root/.marginalia

# Start server
CMD ["node", "--experimental-sqlite", "dist/server.js"]

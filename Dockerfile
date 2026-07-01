# syntax=docker/dockerfile:1

# ---- Build stage ----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Install dependencies against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Branding assets served at /logo.svg, /favicon.svg, /assets/*.
COPY assets ./assets

# Default to the HTTP transport for a remote connector.
ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000

# Run as the built-in non-root user.
USER node

CMD ["node", "dist/index.js"]

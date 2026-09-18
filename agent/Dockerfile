FROM node:20-alpine

# Install Docker CLI and Git for sandbox orchestration and repository workflows
RUN apk add --no-cache docker-cli git

WORKDIR /app

# Copy dependency manifests
COPY agent/package*.json ./

# Install agent dependencies
RUN npm install

# Copy agent source code and configuration
COPY agent/tsconfig.json ./
COPY agent/src ./src

# Default entry point orchestrates the full remediation flow
CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the backend port
EXPOSE 5000

# Run with tsx (dev mode, same as npm run dev)
CMD ["npx", "tsx", "watch", "src/server.ts"]

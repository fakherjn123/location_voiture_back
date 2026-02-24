# Use Node image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]

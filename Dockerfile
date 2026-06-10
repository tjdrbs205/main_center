FROM node:20-alpine

# Install docker cli, ssh-client, and build tools for node-gyp (better-sqlite3)
RUN apk add --no-cache docker-cli openssh-client python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start:prod"]

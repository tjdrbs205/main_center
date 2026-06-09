FROM node:20-alpine

# Install docker cli and ssh-client for deployment
RUN apk add --no-cache docker-cli openssh-client

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

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV SCREEN_SHARE_PIN=ABC123

EXPOSE 3000

CMD ["npm", "start"]
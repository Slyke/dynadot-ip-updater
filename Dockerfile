
FROM node:22.12.0-bookworm

WORKDIR /app

COPY ./src/* ./

CMD ["node", "index.js"]

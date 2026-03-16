FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/message-service/ ./apps/message-service/
RUN npm install
RUN npm run build --workspace=@autozap/message-service
EXPOSE 3004
CMD ["npm", "run", "start", "--workspace=@autozap/message-service"]

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/contact-service/ ./apps/contact-service/
RUN npm install
RUN npm run build --workspace=@autozap/contact-service
EXPOSE 3005
CMD ["npm", "run", "start", "--workspace=@autozap/contact-service"]

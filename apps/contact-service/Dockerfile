FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/contact-service/ ./apps/contact-service/
RUN npm install --workspaces --include-workspace-root
EXPOSE 3004
CMD ["npm", "run", "start", "--workspace=@autozap/contact-service"]

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/message-service/ ./apps/message-service/
RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@autozap/types
RUN npm run build --workspace=@autozap/utils
EXPOSE 3006
CMD ["npm", "run", "start", "--workspace=@autozap/message-service"]

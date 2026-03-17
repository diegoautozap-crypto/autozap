FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/conversation-service/ ./apps/conversation-service/
RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@autozap/types
RUN npm run build --workspace=@autozap/utils
EXPOSE 3005
CMD ["npm", "run", "start", "--workspace=@autozap/conversation-service"]

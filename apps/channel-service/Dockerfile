FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/channel-service/ ./apps/channel-service/
RUN npm install --workspaces --include-workspace-root
EXPOSE 3003
CMD ["npm", "run", "start", "--workspace=@autozap/channel-service"]

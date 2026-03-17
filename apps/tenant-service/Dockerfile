FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/tenant-service/ ./apps/tenant-service/
RUN npm install --workspaces --include-workspace-root
EXPOSE 3007
CMD ["npm", "run", "start", "--workspace=@autozap/tenant-service"]

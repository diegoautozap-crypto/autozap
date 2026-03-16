FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/campaign-service/ ./apps/campaign-service/
RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@autozap/campaign-service
EXPOSE 3007
CMD ["npm", "run", "start", "--workspace=@autozap/campaign-service"]

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/campaign-service/ ./apps/campaign-service/
RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@autozap/types
RUN npm run build --workspace=@autozap/utils
EXPOSE 3002
CMD ["npm", "run", "start", "--workspace=@autozap/campaign-service"]

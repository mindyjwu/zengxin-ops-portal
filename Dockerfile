# 後端 API 的容器映像（給 Google Cloud Run 用）
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY backend ./backend
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]

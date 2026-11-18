# 後端 API 與連後端版網站的容器映像（給 Google Cloud Run 用）
# 只裝正式環境要用的套件（express、pg、google-auth-library）；開發與測試用的套件（PGlite、Jest、Playwright）不進映像。
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY backend ./backend
COPY web ./web
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]

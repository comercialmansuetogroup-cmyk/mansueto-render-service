FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Importante: evita que Playwright intente bajar browsers a /root/.cache
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json .notice.txt* ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm","start"]

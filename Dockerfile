FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/app/supabase/prod-ca-2021.crt
CMD ["node", "server.js"]

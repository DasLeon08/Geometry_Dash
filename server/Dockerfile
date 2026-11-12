# Neon Hop Server als Container (für Fly.io, Railway, eigenen Server …).
# Aus dem Hauptordner des Repos bauen:  docker build -f server/Dockerfile .
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/server.js server/levels.js server/store.js server/filter.js server/admin.html server/admin.js ./server/
COPY js/engine.js ./js/engine.js
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server/server.js"]

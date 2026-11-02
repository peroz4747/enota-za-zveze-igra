# Enota za zveze — igra in strežnik za rezultate v enem vsebniku.

# 1) Prenese three.js r128, da igra deluje tudi brez interneta (npr. na lokalni Wi-Fi točki).
FROM node:22-alpine AS vendor
WORKDIR /v
RUN npm pack three@0.128.0 --silent && tar xzf three-0.128.0.tgz \
 && mkdir -p out && cp package/build/three.min.js out/ && cp package/examples/js/controls/OrbitControls.js out/

# 2) Strežnik (brez zunanjih knjižnic).
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY lib ./lib
COPY server ./server
COPY public ./public
COPY --from=vendor /v/out ./public/vendor
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/server.mjs"]

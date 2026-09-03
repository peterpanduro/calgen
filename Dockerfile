# ---------- build ----------
FROM node:24-trixie-slim AS build
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

# ---------- runtime ----------
FROM node:24-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    PORT=3000 \
    BODY_SIZE_LIMIT=24M \
    NODE_OPTIONS=--max-old-space-size=768
# ORIGIN has no default — it MUST be supplied at run time (SPEC §9).
WORKDIR /app
COPY --from=build --chown=node:node /app/build        ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
# fontsDir() resolves <cwd>/static/fonts; this is the copy the PDF path reads.
COPY --from=build --chown=node:node /app/static/fonts ./static/fonts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","build/index.js"]

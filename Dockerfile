# SmartFlux API (and the built web app, once apps/frontend exists). Sample mode by default:
#   docker build -t smartflux . && docker run -p 8000:8000 smartflux
# Live mode: pass a .env (docker run --env-file .env ...). Reach Nightshift and Zetaris on the host through
# host.docker.internal, not 127.0.0.1 (technical execution guide).
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY apps ./apps
COPY data ./data
COPY input_examples ./input_examples
ENV PORT=8000 SAMPLE_MODE=true
EXPOSE 8000
CMD ["pnpm", "start"]

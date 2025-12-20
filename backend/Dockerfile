FROM oven/bun AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json


RUN bun install  # Ensure bcrypt or bcryptjs is installed

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile server \
    ./src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

FROM oven/bun:1.3.4

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY ./src ./src

# migrations
# COPY ./scripts ./scripts
# COPY ./docker-entrypoint.sh ./docker-entrypoint.sh
# RUN chmod +x ./docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 8000
# ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "src/index.ts"]
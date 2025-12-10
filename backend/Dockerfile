FROM oven/bun AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --external mongoose \
    --external nodemailer \
    --external @aws-sdk/client-s3 \
    --external @aws-sdk/s3-request-presigner \
    --outfile server \
    ./src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server
COPY --from=build /app/node_modules ./node_modules

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 8000
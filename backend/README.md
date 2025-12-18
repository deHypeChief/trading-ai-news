# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## Environment & CORS
The backend reads allowed frontend origins from `FRONTEND_URLS` (comma-separated) or `FRONTEND_URL`. When using credentialed requests (cookies or Authorization headers), the server echoes the exact allowed origin in `Access-Control-Allow-Origin`.

- Set `FRONTEND_URLS=https://smartmoneycalender.com` in production (or multiple origins separated by commas).
- Restart the backend after changing env vars.

Troubleshooting:
- If you see `No 'Access-Control-Allow-Origin' header` in the browser, ensure the request reaches the backend (OPTIONS must not be blocked by a proxy/CDN) and that the origin is present in `FRONTEND_URLS`.
- Use the following curl to test preflight:

```bash
curl -i -X OPTIONS 'https://api.smartmoneycalender.com/api/auth/login' \
  -H 'Origin: https://smartmoneycalender.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
```
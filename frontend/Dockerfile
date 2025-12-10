# ---------- Build Stage ----------
    FROM oven/bun:1-alpine AS builder

    WORKDIR /app
    
    # Copy dependency files
    COPY package.json  ./
    RUN bun install 
    
    # Copy source files
    COPY . .
    RUN bun run build
    
    
    # ---------- Serve Stage ----------
    FROM oven/bun:1-alpine
    WORKDIR /app
    
    # Copy built files only
    COPY --from=builder /app/dist ./dist
    
    # Add Bun server script
    RUN echo 'import { serve } from "bun"; \
    import { join, extname } from "path"; \
    import { existsSync } from "fs"; \
    import { gzipSync } from "bun"; \
    \
    const dist = "./dist"; \
    const cacheControl = { \
      ".html": "no-cache", \
      ".js": "public, max-age=31536000, immutable", \
      ".css": "public, max-age=31536000, immutable", \
      ".png": "public, max-age=31536000, immutable", \
      ".jpg": "public, max-age=31536000, immutable", \
      ".svg": "public, max-age=31536000, immutable", \
      ".webp": "public, max-age=31536000, immutable", \
    }; \
    \
    serve({ \
      port: 3000, \
      async fetch(req) { \
        const url = new URL(req.url); \
        let filePath = join(dist, url.pathname); \
        let ext = extname(filePath); \
    \
        try { \
          if (!existsSync(filePath) || url.pathname.endsWith("/")) { \
            filePath = join(dist, "index.html"); \
            ext = ".html"; \
          } \
    \
          const file = Bun.file(filePath); \
          const data = await file.arrayBuffer(); \
    \
          const shouldCompress = [".html", ".js", ".css", ".json", ".svg"].includes(ext); \
          const body = shouldCompress ? gzipSync(Buffer.from(data)) : data; \
    \
          const headers = new Headers({ \
            "Content-Type": file.type, \
            "Cache-Control": cacheControl[ext] || "public, max-age=3600", \
          }); \
    \
          if (shouldCompress) headers.set("Content-Encoding", "gzip"); \
    \
          return new Response(body, { headers }); \
        } catch { \
          return new Response("Not found", { status: 404 }); \
        } \
      }, \
    }); \
    \
    console.log("🚀 Bun server running at http://localhost:3000");' > server.js
    
    EXPOSE 3000
    CMD ["bun", "server.js"]
    
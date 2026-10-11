import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./serveStatic";
import { applySecurityMiddleware, requestValidator } from "../security";
import {registerApiBodyParsers} from '../apiBodyParser';
import { fileUploadRouter } from "../fileUpload";
import { fileDownloadRouter } from "../fileDownload";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  if (!process.env.DATABASE_URL || (process.env.JWT_SECRET || '').length < 32)
    throw new Error('Configure DATABASE_URL and a random JWT_SECRET of at least 32 characters');
  const app = express();
  const server = createServer(app);
  // Apply security middleware
  applySecurityMiddleware(app);
  registerApiBodyParsers(app);
  app.use(requestValidator);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload route (PDF, DOCX, XLSX)
  app.use(fileUploadRouter);
  // Protected file download route; IDrive objects are exposed through short-lived signed URLs.
  app.use(fileDownloadRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Avoid shipping or loading development tooling in an npm ci --omit=dev installation.
    const developmentModule = './vite.ts';
    const { setupVite } = await import(developmentModule);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = process.env.NODE_ENV === 'production' ? preferredPort : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, process.env.APP_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'), () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error=>{console.error('[Startup]',error.message);process.exit(1);});

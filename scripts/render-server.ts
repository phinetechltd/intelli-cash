import { createServer } from "node:http";
import { resolve } from "node:path";
import next from "next";
import { createApp } from "../apps/api/src/app";
import { prisma } from "../apps/api/src/lib/prisma";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const webDir = resolve(process.cwd(), "apps/web");
const nextApp = next({ dev: false, dir: webDir });
const nextHandler = nextApp.getRequestHandler();
let server: ReturnType<typeof createServer> | null = null;

async function start() {
  await nextApp.prepare();

  const app = createApp({ includeNotFoundHandler: false });

  app.all("*", (req, res) => {
    nextHandler(req, res);
  });

  server = createServer(app);

  server.listen(port, "0.0.0.0", () => {
    console.log(`Intelli-Cash web and API listening on port ${port}`);
  });
}

async function shutdown() {
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

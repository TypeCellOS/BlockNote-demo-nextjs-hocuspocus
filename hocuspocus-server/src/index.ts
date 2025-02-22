import { SQLite } from "@hocuspocus/extension-sqlite";
import { Document, Server } from "@hocuspocus/server";

import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { FAKE_authInfoFromToken } from "./auth.js";
import { threadsRouter } from "./threads.js";

// Setup Hocuspocus server
const hocuspocusServer = Server.configure({
  async onAuthenticate(data) {
    const { token } = data;

    const authInfo = FAKE_authInfoFromToken(token);

    if (authInfo === "unauthorized") {
      throw new Error("Not authorized!");
    }

    data.connection.readOnly = authInfo.role === "COMMENT-ONLY";
  },

  extensions: [
    new SQLite({
      database: "db.sqlite",
    }),
  ],

  // TODO: for good security, you'd want to make sure that either:
  // - incoming updates to the "thread" map within the Y.Doc are denied (these should only be made via the thread API)
  // - alternatively, use a separate Y.Doc for the thread data that can only be written to via the thread API
});

// Setup Hono server
const app = new Hono();
app.use(cors());

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// We mount HocusPocus in the Hono server
app.get(
  "/hocuspocus",
  upgradeWebSocket((c) => ({
    onOpen(_evt, ws) {
      hocuspocusServer.handleConnection(ws.raw, c.req.raw);
    },
  }))
);

// Simple route for testing
app.get("/", (c) => c.text("Hello World"));

// Middleware so all requests to /documents/:documentId/ have the yjs document available
const documentMiddleware = createMiddleware<{
  Variables: {
    document: Document;
  };
}>(async (c, next) => {
  const documentId = c.req.param("documentId");
  const document = hocuspocusServer.documents.get(documentId!);

  if (!document) {
    return c.json({ error: "Document not found" }, 404);
  }

  c.set("document", document);

  await next();
});

app.use("/documents/:documentId/*", documentMiddleware);

// Mount the thread REST API
app.route(
  "/documents/:documentId/threads",
  threadsRouter({ threadsMapKey: "threads" })
);

// Start server
const server = serve({
  fetch: app.fetch,
  port: 8787,
});

// Setup WebSocket support (needed for HocusPocus)
injectWebSocket(server);

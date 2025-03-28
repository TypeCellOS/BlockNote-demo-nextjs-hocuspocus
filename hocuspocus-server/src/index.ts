import { SQLite } from "@hocuspocus/extension-sqlite";
import { type Document, Hocuspocus } from "@hocuspocus/server";

import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { FAKE_authInfoFromToken } from "./auth.js";
import { threadsRouter } from "./threads.js";
import { RejectUnauthorized } from "./rejectUnauthorized.js";
// Setup Hocuspocus server

const hocuspocus = new Hocuspocus({
  async onAuthenticate(data) {
    const { token } = data;

    const authInfo = FAKE_authInfoFromToken(token);

    if (authInfo === "unauthorized") {
      throw new Error("Not authorized!");
    }
    
    data.connectionConfig.readOnly = authInfo.role === "COMMENT-ONLY";
  },

  extensions: [
    new SQLite({
      database: ":memory:",
    }),
    // TODO we can actually just do the auth check in here, and not need the server to inject the mark or anything
    new RejectUnauthorized("threads", (payload) => {
      // eslint-disable-next-line no-console
      console.warn("rejecting update to document", payload.documentName);
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
      hocuspocus.handleConnection(ws.raw, c.req.raw as any);
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
  const document = hocuspocus.documents.get(documentId!);

  if (!document) {
    return c.json({ error: "Document not found" }, 404);
  }

  c.set("document", document);

  await next();
  return;
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
}, (info) => {
  hocuspocus.hooks('onListen', {
    instance: hocuspocus,
    configuration: hocuspocus.configuration,
    port: info.port
  })
});

// Setup WebSocket support (needed for HocusPocus)
injectWebSocket(server);

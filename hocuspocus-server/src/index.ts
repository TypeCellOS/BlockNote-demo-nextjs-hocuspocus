import { SQLite } from "@hocuspocus/extension-sqlite";
import { Document, Server } from "@hocuspocus/server";

import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { authInfoFromToken } from "./auth.js";
import { threadsRouter } from "./threads.js";

const hocuspocusServer = Server.configure({
  async onAuthenticate(data) {
    const { token } = data;

    const authInfo = authInfoFromToken(token);

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

const app = new Hono();

app.use(cors());

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  "/hocuspocus",
  upgradeWebSocket((c) => ({
    onOpen(_evt, ws) {
      hocuspocusServer.handleConnection(ws.raw, c.req.raw);
    },
  }))
);

app.get("/", (c) => c.text("Hello World"));

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

app.route(
  "/documents/:documentId/threads",
  threadsRouter({ threadsMapKey: "threads" })
);

const server = serve({
  fetch: app.fetch,
  port: 8787,
});

injectWebSocket(server);

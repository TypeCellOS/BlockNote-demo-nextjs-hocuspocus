import { DefaultThreadStoreAuth, YjsThreadStore } from "@blocknote/core";
import { Document } from "@hocuspocus/server";
import { Hono, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { FAKE_authInfoFromToken } from "./auth.js";
import { setMark } from "./setMark.js";
// Middleware that parses the Authorization header and sets the userId and role
// based on the token.
// NOTE: This is a fake implementation for demo purposes.
const authMiddleware = createMiddleware<{
  Variables: {
    userId: string;
    role: "COMMENT-ONLY" | "READ-WRITE";
  };
}>(async (c, next) => {
  const auth = c.req.header("Authorization") || "";
  const parts = auth.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }

  const authInfo = FAKE_authInfoFromToken(parts[1]);

  if (authInfo === "unauthorized") {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }

  c.set("userId", authInfo.userId);
  c.set("role", authInfo.role);

  await next();
  return;
});

// Middleware that based on the auth info creates a YjsThreadStore and makes it available to the request
const threadStoreMiddleware = (options: { threadsMapKey: string }) =>
  createMiddleware<{
    Variables: {
      userId: string;
      role: "COMMENT-ONLY" | "READ-WRITE";
      document: Document;
      threadStore: YjsThreadStore;
    };
  }>(async (c, next) => {
    const threadStore = new YjsThreadStore(
      c.get("userId"),
      c.get("document").getMap(options.threadsMapKey),
      new DefaultThreadStoreAuth(
        c.get("userId"),
        c.get("role") === "COMMENT-ONLY" ? "commenter" : "editor"
      )
    );

    c.set("threadStore", threadStore);

    await next();
  });

// The REST API that handles thread operations and executes them using the threadStore
export const threadsRouter = (options: { threadsMapKey: string }) => {
  const router = new Hono<{
    Variables: {
      document: Document;
      userId: string;
      role: "COMMENT-ONLY" | "READ-WRITE";
      threadStore: YjsThreadStore;
    };
  }>();

  router.use("*", authMiddleware, threadStoreMiddleware(options));

  // create thread
  router.post("/", async (c, next: Next) => {
    const json = await c.req.json();
    // TODO: you'd probably validate the request json here

    const thread = await c.get("threadStore").createThread(json);
    return c.json(thread);
  });

  // addToDocument
  router.post("/:threadId/addToDocument", async (c) => {
    const json = await c.req.json();
    // TODO: you'd probably validate the request json here

    const doc = c.get("document");
    const fragment = doc.getXmlFragment("doc");

    setMark(doc, fragment, json.selection.yjs, "comment", {
      orphan: false,
      threadId: c.req.param("threadId"),
    });

    return c.json({ message: "Thread added to document" });
  });

  // addComment
  router.post("/:threadId/comments", async (c) => {
    const json = await c.req.json();
    // TODO: you'd probably validate the request json here

    const comment = await c.get("threadStore").addComment({
      threadId: c.req.param("threadId"),
      ...json,
    });
    return c.json(comment);
  });

  // updateComment
  router.put("/:threadId/comments/:commentId", async (c) => {
    const json = await c.req.json();
    // TODO: you'd probably validate the request json here

    await c.get("threadStore").updateComment({
      threadId: c.req.param("threadId"),
      commentId: c.req.param("commentId"),
      ...json,
    });

    return c.json({ message: "Comment updated" });
  });

  // deleteComment
  router.delete("/:threadId/comments/:commentId", async (c) => {
    await c.get("threadStore").deleteComment({
      threadId: c.req.param("threadId"),
      commentId: c.req.param("commentId"),
      softDelete: c.req.query("softDelete") === "true",
    });
    return c.json({ message: "Comment deleted" });
  });

  // deleteThread
  router.delete("/:threadId", async (c) => {
    await c.get("threadStore").deleteThread({
      threadId: c.req.param("threadId"),
    });

    return c.json({ message: "Thread deleted" });
  });

  // resolveThread
  router.post("/:threadId/resolve", async (c) => {
    await c.get("threadStore").resolveThread({
      threadId: c.req.param("threadId"),
    });

    return c.json({ message: "Thread resolved" });
  });

  // unResolveThread
  router.post("/:threadId/unresolve", async (c) => {
    await c.get("threadStore").unresolveThread({
      threadId: c.req.param("threadId"),
    });

    return c.json({ message: "Thread un-resolved" });
  });

  // addReaction
  router.post("/:threadId/comments/:commentId/reactions", async (c) => {
    const json = await c.req.json();
    // TODO: you'd probably validate the request json here

    await c.get("threadStore").addReaction({
      threadId: c.req.param("threadId"),
      commentId: c.req.param("commentId"),
      emoji: json.emoji,
    });

    return c.json({ message: "Reaction added" });
  });

  // deleteReaction
  router.delete(
    "/:threadId/comments/:commentId/reactions/:emoji",
    async (c) => {
      await c.get("threadStore").deleteReaction({
        threadId: c.req.param("threadId"),
        commentId: c.req.param("commentId"),
        emoji: c.req.param("emoji"),
      });
      return c.json({ message: "Reaction deleted" });
    }
  );

  return router;
};

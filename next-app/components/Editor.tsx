"use client"; // this registers <Editor> as a Client Component
import {
  DefaultThreadStoreAuth,
  RESTYjsThreadStore,
} from "@blocknote/core/comments";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect } from "react";

// Hardcoded settings for demo purposes
const USER_ID = "user123";
const USER_ROLE: "COMMENT-ONLY" | "READ-WRITE" = "READ-WRITE";
const DOCUMENT_ID = "mydoc1234";
const TOKEN = `${USER_ID}__${USER_ROLE}`;

// Setup Hocuspocus provider
const provider = new HocuspocusProvider({
  url: "ws://localhost:8787/hocuspocus",
  token: TOKEN,
  name: DOCUMENT_ID,
});

// The thread store auth is used by the BlockNote interface to determine which actions are allowed
// (and which elements should be shown)
const threadStoreAuth = new DefaultThreadStoreAuth(
  USER_ID,
  USER_ROLE === "READ-WRITE" ? "editor" : "comment"
);

// set up the thread store using the REST API
const threadStore = new RESTYjsThreadStore(
  `http://localhost:8787/documents/${DOCUMENT_ID}/threads`,
  {
    Authorization: `Bearer ${TOKEN}`,
  },
  provider.document.getMap("threads"),
  threadStoreAuth
);

// Instead of using the REST API, you could also use a YjsThreadStore
// however, this lacks good authentication on comment operations
//
// const threadStore = new YjsThreadStore(
//   USER_ID,
//   provider.document.getMap("threads"),
//   threadStoreAuth
// );

// Our <Editor> component we can reuse later
export default function Editor() {
  // Creates a new editor instance.
  const editor = useCreateBlockNote({
    collaboration: {
      provider,
      fragment: provider.document.getXmlFragment("doc"),
      user: {
        name: "John Doe",
        color: "#ff0000",
      },
    },
    resolveUsers: async (userIds) => {
      // sample implementation, replace this with a call to your own user database for example
      return userIds.map((userId) => ({
        id: userId,
        username: "John Doe",
        avatarUrl: "https://placehold.co/100x100",
      }));
    },
    comments: {
      threadStore,
    },
  });

  useEffect(() => {
    provider.document.on("update", (update) => {
      console.log(provider.document.getMap("threads").toJSON());
    });
  }, [provider.document]);

  // Renders the editor instance using a React component.
  return (
    <>
      <button
        onClick={() => {
          const comments = provider.document.getMap("threads");
          comments.set("unauthorized-thread", {
            id: "unauthorized-thread",
            createdAt: 1741265978860,
            updatedAt: 1741265978860,
            comments: [
              {
                id: "unauthorized-comment",
                userId: "unauthorized-user",
                createdAt: 1741265978860,
                updatedAt: 1741265978860,
                body: [
                  {
                    id: "unauthorized-comment-body",
                    type: "paragraph",
                    props: {},
                    content: [
                      {
                        type: "text",
                        text: "This comment should not be visible",
                        styles: {},
                      },
                    ],
                    children: [],
                  },
                ],
                reactionsByUser: {},
              },
            ],
            resolved: false,
          });
        }}
      >
        Unauthorized comment modification
      </button>
      <p>
        Pressing the button above will add a new comment to the threads map, but
        this change will be rejected by the server.
      </p>
      <BlockNoteView editor={editor} />
    </>
  );
}

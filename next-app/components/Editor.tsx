"use client"; // this registers <Editor> as a Client Component
import { DefaultThreadStoreAuth, RESTYjsThreadStore } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";

const USER_ID = "user123";
const USER_ROLE: "COMMENT-ONLY" | "READ-WRITE" = "READ-WRITE";
const DOCUMENT_ID = "mydoc123";
const TOKEN = `${USER_ID}__${USER_ROLE}`;

const provider = new HocuspocusProvider({
  url: "ws://localhost:8787/hocuspocus",
  token: TOKEN,
  name: DOCUMENT_ID,
});

// const threadStore = new YjsThreadStore(
//   "123",
//   provider.document.getMap("threads"),
//   new DefaultThreadStoreAuth("123", "editor")
// );

debugger;
const threadStore = new RESTYjsThreadStore(
  `http://localhost:8787/documents/${DOCUMENT_ID}/threads`,
  {
    Authorization: `Bearer ${TOKEN}`,
  },
  provider.document.getMap("threads"),
  new DefaultThreadStoreAuth(
    USER_ID,
    USER_ROLE === "READ-WRITE" ? "editor" : "comment"
  )
);

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

  // Renders the editor instance using a React component.
  return <BlockNoteView editor={editor} />;
}

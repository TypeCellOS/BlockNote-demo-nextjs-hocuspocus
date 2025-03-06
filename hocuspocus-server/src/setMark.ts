import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { Mark, mergeAttributes } from "@tiptap/core";
import { Document } from "@hocuspocus/server";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  initProseMirrorDoc,
  relativePositionToAbsolutePosition,
  updateYFragment,
} from "y-prosemirror";
import * as Y from "yjs";

/**
 * Sets a mark in the yjs document based on a yjs selection
 */
export function setMark(
  doc: Document,
  fragment: Y.XmlFragment,
  yjsSelection: {
    anchor: any;
    head: any;
  },
  markName: string,
  markAttributes: any
) {
  // needed to get the pmSchema
  // if you use a BlockNote custom schema, make sure to pass it to the create options
  const editor = ServerBlockNoteEditor.create({
    _extensions: {
      // TODO to get this to work, I needed to pass a copy of the comment mark to get it into the schema
      comments: Mark.create({
        name: "comment",
        excludes: "",
        inclusive: false,
        keepOnSplit: true,
        group: "blocknoteIgnore", // ignore in blocknote json

        addAttributes() {
          // Return an object with attribute configuration
          return {
            // orphans are marks that currently don't have an active thread. It could be
            // that users have resolved the thread. Resolved threads by default are not shown in the document,
            // but we need to keep the mark (positioning) data so we can still "revive" it when the thread is unresolved
            // or we enter a "comments" view that includes resolved threads.
            orphan: {
              parseHTML: (element) => !!element.getAttribute("data-orphan"),
              renderHTML: (attributes) => {
                return (attributes as { orphan: boolean }).orphan
                  ? {
                      "data-orphan": "true",
                    }
                  : {};
              },
              default: false,
            },
            threadId: {
              parseHTML: (element) => element.getAttribute("data-bn-thread-id"),
              renderHTML: (attributes) => {
                return {
                  "data-bn-thread-id": (attributes as { threadId: string })
                    .threadId,
                };
              },
              default: "",
            },
          };
        },

        renderHTML({
          HTMLAttributes,
        }: {
          HTMLAttributes: Record<string, any>;
        }) {
          return [
            "span",
            mergeAttributes(HTMLAttributes, {
              class: "bn-thread-mark",
            }),
          ];
        },

        parseHTML() {
          return [{ tag: "span.bn-thread-mark" }];
        },

        extendMarkSchema(extension) {
          if (extension.name === "comment") {
            return {
              blocknoteIgnore: true,
            };
          }
          return {};
        },
      }),
    },
  });

  // get the prosemirror document
  const { doc: pNode, mapping } = initProseMirrorDoc(
    fragment,
    editor.editor.pmSchema as any
  );

  // get the prosemirror positions based on the yjs positions
  // we need to get this from yjs because other users might have made changes in between
  const anchor = relativePositionToAbsolutePosition(
    doc,
    fragment,
    yjsSelection.anchor,
    mapping
  );
  const head = relativePositionToAbsolutePosition(
    doc,
    fragment,
    yjsSelection.head,
    mapping
  );

  // now, let's create the mark in the prosemirror document
  const state = EditorState.create({
    doc: pNode,
    schema: editor.editor.pmSchema as any,
    selection: TextSelection.create(pNode, anchor!, head!),
  });

  const tr = setMarkInProsemirror(
    editor.editor.pmSchema.marks[markName],
    markAttributes,
    state
  );

  // finally, update the yjs document with the new prosemirror document
  updateYFragment(doc, fragment, tr.doc, mapping);
}

// based on https://github.com/ueberdosis/tiptap/blob/f3258d9ee5fb7979102fe63434f6ea4120507311/packages/core/src/commands/setMark.ts#L66
export const setMarkInProsemirror = (
  type: any,
  attributes = {},
  state: EditorState
) => {
  let tr = state.tr;
  const { selection } = state;
  const { ranges } = selection;

  ranges.forEach((range) => {
    const from = range.$from.pos;
    const to = range.$to.pos;

    state.doc.nodesBetween(from, to, (node, pos) => {
      const trimmedFrom = Math.max(pos, from);
      const trimmedTo = Math.min(pos + node.nodeSize, to);
      const someHasMark = node.marks.find((mark) => mark.type === type);

      // if there is already a mark of this type
      // we know that we have to merge its attributes
      // otherwise we add a fresh new mark
      if (someHasMark) {
        node.marks.forEach((mark) => {
          if (type === mark.type) {
            tr = tr.addMark(
              trimmedFrom,
              trimmedTo,
              type.create({
                ...mark.attrs,
                ...attributes,
              })
            );
          }
        });
      } else {
        tr = tr.addMark(trimmedFrom, trimmedTo, type.create(attributes));
      }
    });
  });
  return tr;
};

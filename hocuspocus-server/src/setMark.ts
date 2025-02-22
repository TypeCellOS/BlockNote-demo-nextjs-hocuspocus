import { ServerBlockNoteEditor } from "@blocknote/server-util";
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
  const editor = ServerBlockNoteEditor.create();

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

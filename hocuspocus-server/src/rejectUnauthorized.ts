import { type beforeSyncPayload, Extension } from "@hocuspocus/server";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

/**
 * This extension rejects any changes to the restricted type.
 *
 * It does this by:
 * - extracting the yjsUpdate from the incoming message
 * - applying the update to the restricted type
 * - if the update is rejected, we throw an error and close the connection
 * - if the update is accepted, we do nothing
 */
export class RejectUnauthorized implements Extension {
  constructor(
    private readonly threadsMapKey: string,
    private readonly onReject?: (payload: beforeSyncPayload) => void
  ) {}
  /**
   * This function protects against changes to the restricted type.
   * It does this by:
   * - setting up an undo manager on the restricted type
   * - caching pending updates from the Ydoc to avoid certain attacks
   * - applying the received update and checking whether the restricted type has been changed
   * - catching errors that might try to circumvent the restrictions
   * - undoing changes on restricted types
   * - reapplying pending updates
   *
   * @param yUpdate The update to apply
   * @param ydoc The document that the update is being applied to
   * @param restrictedType The type that we want to protect
   * @returns true if the update was rejected, false otherwise
   */
  private applyUpdateAndRollbackIfNeeded(
    yUpdate: Uint8Array,
    ydoc: Y.Doc,
    restrictedType: Y.AbstractType<any>
  ) {
    // don't handle changes of the local undo manager, which is used to undo invalid changes
    const um = new Y.UndoManager(restrictedType, {
      trackedOrigins: new Set(["remote change"]),
    });
    const beforePendingDs = ydoc.store.pendingDs;
    const beforePendingStructs = ydoc.store.pendingStructs?.update;
    let didNeedToUndo = false;
    try {
      Y.applyUpdate(ydoc, yUpdate, "remote change");
    } finally {
      while (um.undoStack.length) {
        um.undo();
        didNeedToUndo = true;
      }
      um.destroy();
      ydoc.store.pendingDs = beforePendingDs;
      ydoc.store.pendingStructs = null;
      if (beforePendingStructs) {
        Y.applyUpdateV2(ydoc, beforePendingStructs);
      }
    }

    return didNeedToUndo;
  }

  /**
   * Before the document is synchronized, we check if the update modifies the restricted type.
   * If it does, we reject the update by undoing it, and calling the onReject callback.
   */
  async beforeSync(data: beforeSyncPayload) {
    // If the ySyncMessageType is not a messageYjsUpdate or a messageYjsSyncStep2, we don't handle the message, since it is not an update
    if (
      !(
        data.type === syncProtocol.messageYjsUpdate ||
        data.type === syncProtocol.messageYjsSyncStep2
      )
    ) {
      // not an update we want to handle
      return;
    }

    const protectedType = data.document.getMap(this.threadsMapKey);
    const didRollback = this.applyUpdateAndRollbackIfNeeded(
      data.payload,
      data.document,
      protectedType
    );

    if (didRollback) {
      this.onReject?.(data);
    }
  }
}

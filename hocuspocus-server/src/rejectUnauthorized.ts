import type { CloseEvent } from "@hocuspocus/common";
import {
  beforeHandleMessagePayload,
  Extension,
  IncomingMessage,
  MessageType,
} from "@hocuspocus/server";
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
  constructor(private readonly threadsMapKey: string) {}
  /**
   * Extract the yjsUpdate from the incoming message
   * @param message
   * @returns
   */
  private getYUpdate(message: Uint8Array) {
    /**
     * The messages we are interested in are of the following format:
     * [docIdLength: number, ...docIdString: string, hocuspocusMessageType: number,  ySyncMessageType: number, ...yjsUpdate: Uint8Array]
     *
     * We check that the hocuspocusMessageType is Sync and that the ySyncMessageType is messageYjsUpdate.
     */
    const incomingMessage = new IncomingMessage(message);
    // Read the docID string, but don't use it
    incomingMessage.readVarString();

    // Read the hocuspocusMessageType
    const hocuspocusMessageType = incomingMessage.readVarUint();
    // If the hocuspocusMessageType is not Sync, we don't handle the message, since it is not an update
    if (
      !(
        hocuspocusMessageType === MessageType.Sync ||
        hocuspocusMessageType === MessageType.SyncReply
      )
    ) {
      return;
    }

    // Read the ySyncMessageType
    const ySyncMessageType = incomingMessage.readVarUint();

    // If the ySyncMessageType is not a messageYjsUpdate or a messageYjsSyncStep2, we don't handle the message, since it is not an update
    if (
      !(
        ySyncMessageType === syncProtocol.messageYjsUpdate ||
        ySyncMessageType === syncProtocol.messageYjsSyncStep2
      )
    ) {
      // not an update we want to handle
      return;
    }

    // Read the yjsUpdate
    const yUpdate = incomingMessage.readVarUint8Array();

    return yUpdate;
  }

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

  async beforeHandleMessage({
    update,
    document: ydoc,
  }: beforeHandleMessagePayload) {
    const yUpdate = this.getYUpdate(update);

    if (!yUpdate) {
      return;
    }

    const protectedType = ydoc.getMap(this.threadsMapKey);
    const didRollback = this.applyUpdateAndRollbackIfNeeded(
      yUpdate,
      ydoc,
      protectedType
    );

    if (didRollback) {
      // TODO, we can close their connection or just let them continue, since we've already undone their changes (and our changes are newer than theirs)
      const error = {
        reason: `Modification of a restricted type: ${this.threadsMapKey} was rejected`,
      } satisfies Partial<CloseEvent>;
      throw error;
    }
  }
}

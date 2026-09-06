/**
 * messages — one message in a conversation (PRD §11.2; ADR-025).
 *
 * Every message names the PERSON who sent it. There is no "side" any more: a conversation has two
 * participants, and `senderUserId` is one of them. Whether a message is "mine" is decided at read
 * time by comparing it with the reader — the same row is "mine" to its author and "theirs" to the
 * other participant.
 */

import mongoose from 'mongoose';
import { MESSAGING_LIMITS } from '@evallo/shared';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: MESSAGING_LIMITS.BODY_MAX_LENGTH,
    },

    /**
     * PRD §8.2 lists attachments for CAN-09. File storage is undecided (TRD §14 Q2), so the field
     * exists and stays empty rather than the message shape changing once storage is chosen.
     */
    attachments: [
      {
        _id: false,
        name: String,
        url: String,
        contentType: String,
        sizeBytes: Number,
      },
    ],

    /** Stamped when the OTHER participant opens the thread. Never set by the sender. */
    readAt: Date,
  },
  { timestamps: true, collection: 'messages' },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

/** The per-person send rate (MESSAGING_LIMITS.MESSAGES_PER_MINUTE). */
messageSchema.index({ senderUserId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);

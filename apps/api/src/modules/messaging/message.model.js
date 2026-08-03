/**
 * messages — one message in a conversation (PRD §11.2).
 */

import mongoose from 'mongoose';

export const MESSAGE_SENDERS = Object.freeze({
  CANDIDATE: 'candidate',
  COMPANY: 'company',
});

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    /** Which SIDE sent it. The individual recruiter is recorded separately, for audit. */
    senderType: {
      type: String,
      required: true,
      enum: Object.values(MESSAGE_SENDERS),
    },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    body: { type: String, required: true, trim: true, maxlength: 5000 },

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

    readAt: Date,
  },
  { timestamps: true, collection: 'messages' },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);

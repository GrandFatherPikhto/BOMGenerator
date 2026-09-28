// Persisted UI state: "what the user was working with" — the selected board,
// page, filters, seller and so on. Kept per user id so it can become truly
// per-account once authentication is added; today every request uses the
// implicit default user (see `currentUserId`).
import mongoose from 'mongoose';

import { UI_STATE_VERSION } from '../../shared/index.js';

const uiStateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true, default: 'default' },
    version: { type: Number, default: UI_STATE_VERSION },
    // Free-shape per-section state, validated/normalised by the shared module
    // before it is written (see `uiStateService`).
    sections: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

/** Return the state document of a user, creating it on first access. */
uiStateSchema.statics.getForUser = async function getForUser(userId = 'default') {
  let state = await this.findOne({ userId });
  if (!state) {
    state = await this.create({ userId });
  }
  return state;
};

export const UiState = mongoose.model('UiState', uiStateSchema);

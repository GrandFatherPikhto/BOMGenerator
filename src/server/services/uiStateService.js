// Read and merge the per-user UI state document. The stored shape is validated
// and merged by the pure shared module, so junk never reaches the database.
import { UI_STATE_VERSION, mergeSections, normalizeUiState } from '../../shared/index.js';
import { DEFAULT_USER_ID } from '../lib/currentUser.js';
import { UiState } from '../models/UiState.js';

/** The wire shape of the document (current version, normalised sections). */
function serialize(state) {
  return normalizeUiState({ sections: state.sections });
}

export async function getUiState(userId = DEFAULT_USER_ID) {
  return serialize(await UiState.getForUser(userId));
}

/**
 * Merge a sections patch into the user's state. Other sections are preserved,
 * so parallel tabs editing different screens do not overwrite each other.
 */
export async function mergeUiState(userId = DEFAULT_USER_ID, patch = {}) {
  const state = await UiState.getForUser(userId);
  state.sections = mergeSections(state.sections, patch);
  state.version = UI_STATE_VERSION;
  state.markModified('sections');
  await state.save();
  return serialize(state);
}

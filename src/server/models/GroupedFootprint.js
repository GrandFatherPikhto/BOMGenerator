// Footprints ("посадочные места") whose purchase positions are grouped by
// footprint only.
//
// The presence of a document means "the checkbox is on" for that footprint. The
// set is global (shared by every user) and lands in the database dump/restore
// automatically, because the dump enumerates collections dynamically.
import mongoose from 'mongoose';

const groupedFootprintSchema = new mongoose.Schema(
  {
    // Normalised footprint key (see src/shared/footprintGroup.js).
    footprint: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const GroupedFootprint = mongoose.model(
  'GroupedFootprint',
  groupedFootprintSchema,
);

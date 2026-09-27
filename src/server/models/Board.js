// A board (a KiCad BOM configuration) or the service "Докупить" board.
import mongoose from 'mongoose';

export const SERVICE_BOARD_NAME = '\u0414\u043e\u043a\u0443\u043f\u0438\u0442\u044c';

const boardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Key of re-import: importing a file with the same name updates this board.
    // The service "Докупить" board omits it, hence `sparse` (several documents
    // without the field are allowed while real names stay unique).
    sourceFile: { type: String, trim: true, unique: true, sparse: true },
    // How many such boards the product contains ("Итого" = qty * count).
    count: { type: Number, default: 1, min: 1 },
    // True for the single service board that holds manually added positions.
    isService: { type: Boolean, default: false },
    // Whether the board takes part in the app (selectors, common purchases).
    enabled: { type: Boolean, default: true },
    // Whether the board's "Общие" rows feed the "Common purchases" sheet.
    inCommon: { type: Boolean, default: true },
    importedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Board = mongoose.model('Board', boardSchema);

// MongoDB connection helper.
import mongoose from 'mongoose';

/**
 * Connect to MongoDB. Throws when the server is unreachable; callers are
 * expected to turn that into a friendly message (see src/server/index.js).
 */
export async function connectDatabase(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

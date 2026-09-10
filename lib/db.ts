import mongoose from "mongoose";
import "@/models/Client";
import "@/models/Site";
import "@/models/Equipe";
import "@/models/Vehicule";
import "@/models/Equipement";
import "@/models/User";
import "@/models/Operation";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function connectDB() {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongodbUri, {
      bufferCommands: false,
      dbName: "srh-ops",
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

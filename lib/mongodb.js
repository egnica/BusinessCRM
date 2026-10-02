import { MongoClient } from "mongodb";
import { createConnectionManager } from "./mongoConnection.mjs";

// Share one pool across route modules and warm production requests. Connect only
// when a request needs it, so a temporary startup failure can be retried.
const connection = globalThis._crmMongoConnection || createConnectionManager(() => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  return new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    waitQueueTimeoutMS: 10000,
  });
});
globalThis._crmMongoConnection = connection;

export default connection;

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Please add MONGODB_URI to the deployment environment");
}

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  if (!global._crmWebhookMongoClientPromise) {
    client = new MongoClient(uri);
    global._crmWebhookMongoClientPromise = client.connect();
  }
  clientPromise = global._crmWebhookMongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export default clientPromise;

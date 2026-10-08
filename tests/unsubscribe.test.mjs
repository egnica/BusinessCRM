import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as unsubscribe from "../lib/unsubscribe.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
process.env.UNSUBSCRIBE_SECRET = "unsubscribe-regression-test-only";

// Run the actual page and POST handler with only the database boundary mocked.
// No real contacts, credentials, email sends, or database writes are used.
function loadModule(path, getMongoClient) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { code } = transformSync(source, {
    filename: path,
    jsc: {
      target: "es2022",
      parser: { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  const exports = {};
  const overrides = {
    "@/lib/mongodb": getMongoClient,
    "@/lib/unsubscribe": unsubscribe,
    "./unsubscribe.module.css": {},
    "./UnsubscribeForm": () => createElement("button", null, "Unsubscribe"),
  };
  runInNewContext(code, {
    exports, Response, URL, console,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
  });
  return exports;
}

function fixture(emailStatus = "subscribed") {
  const contact = { _id: new ObjectId(), firstName: "Test", emailStatus };
  let connections = 0;
  let writes = 0;
  const getMongoClient = async () => {
    connections++;
    return {
      db: () => ({
        collection: (name) => ({
          async findOne(filter) {
            assert.equal(name, "contacts");
            assert.equal(String(filter._id), String(contact._id));
            return contact;
          },
          async updateOne(_filter, update) {
            if (name === "contacts") {
              writes++;
              Object.assign(contact, update.$set);
              return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
          },
        }),
      }),
    };
  };
  const token = unsubscribe.createUnsubscribeToken(contact._id, new ObjectId());
  return { getMongoClient, contact, token, counts: () => ({ connections, writes }) };
}

test("valid unsubscribe page connects and renders confirmation without opting anyone out", async () => {
  const f = fixture();
  const page = loadModule("../app/unsubscribe/page.jsx", f.getMongoClient).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ token: f.token }) }));
  assert.match(html, /<button>Unsubscribe<\/button>/);
  assert.deepEqual(f.counts(), { connections: 1, writes: 0 });
  assert.equal(f.contact.emailStatus, "subscribed");
});

test("invalid token does not connect to the database", async () => {
  const f = fixture();
  const page = loadModule("../app/unsubscribe/page.jsx", f.getMongoClient).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ token: "invalid" }) }));
  assert.match(html, /This unsubscribe link is invalid/);
  assert.deepEqual(f.counts(), { connections: 0, writes: 0 });
});

test("confirmation POST unsubscribes once and repeated POSTs remain successful", async () => {
  const f = fixture();
  const { POST } = loadModule("../app/api/newsletters/unsubscribe/route.js", f.getMongoClient);
  const request = () => new Request(`https://example.com/api/newsletters/unsubscribe?token=${f.token}`, { method: "POST" });
  const first = await POST(request());
  assert.equal(first.status, 200);
  assert.equal((await first.json()).alreadyUnsubscribed, false);
  assert.equal(f.contact.emailStatus, "unsubscribed");
  const second = await POST(request());
  assert.equal(second.status, 200);
  assert.equal((await second.json()).alreadyUnsubscribed, true);
  assert.equal(f.counts().writes, 1);
  const page = loadModule("../app/unsubscribe/page.jsx", f.getMongoClient).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ token: f.token }) }));
  assert.match(html, /already unsubscribed/);
});

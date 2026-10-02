export function createConnectionManager(createClient) {
  let pending;

  return function getMongoClient() {
    if (!pending) {
      let client;
      const attempt = Promise.resolve()
        .then(() => {
          client = createClient();
          return client.connect();
        })
        .catch(async (error) => {
          if (pending === attempt) pending = undefined;
          try {
            await client?.close();
          } catch {
            // Preserve the original connection error.
          }
          throw error;
        });
      pending = attempt;
    }
    return pending;
  };
}

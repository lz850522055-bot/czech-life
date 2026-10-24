/** Small, account-scoped memory cache. It never writes browser/offline storage. */
export function createRequestCache({
  defaultMaxAgeMs = 60_000,
  maxEntries = 24,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 24) {
    throw new RangeError('maxEntries must be an integer from 1 to 24');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const validAge = age => {
    if (!Number.isFinite(age) || age < 0) throw new RangeError('maxAgeMs must be finite and non-negative');
    return age;
  };
  validAge(defaultMaxAgeMs);
  const entries = new Map();
  let generation = 0;

  function cacheKey(userId, key, version) {
    if (typeof userId !== 'string' || !userId) throw new TypeError('userId is required');
    if (typeof key !== 'string' || !key) throw new TypeError('key is required');
    if (typeof version !== 'string') throw new TypeError('version must be a string');
    return JSON.stringify([userId, key, version]);
  }
  function fresh(entry, maxAgeMs = entry.maxAgeMs) {
    return entry.status === 'ready' && now() - entry.loadedAt < Math.min(entry.maxAgeMs, maxAgeMs);
  }
  function touch(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
  }
  function get(userId, key, loader, { version = '', maxAgeMs = defaultMaxAgeMs } = {}) {
    const id = cacheKey(userId, key, version);
    validAge(maxAgeMs);
    if (typeof loader !== 'function') throw new TypeError('loader must be a function');
    const found = entries.get(id);
    if (found && (found.status === 'pending' || fresh(found, maxAgeMs))) {
      touch(id, found);
      return found.status === 'pending' ? found.promise : Promise.resolve(found.value);
    }
    if (found) entries.delete(id);

    const startedGeneration = generation;
    const entry = { status: 'pending', maxAgeMs, promise: null };
    entries.set(id, entry);
    // Pending and completed entries share the same strict size bound.
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    entry.promise = Promise.resolve().then(loader).then(
      value => {
        if (generation === startedGeneration && entries.get(id) === entry) {
          entry.status = 'ready';
          entry.value = value;
          entry.loadedAt = now();
        }
        return value;
      },
      error => {
        // A cleared/evicted request must not delete its newer replacement.
        if (generation === startedGeneration && entries.get(id) === entry) entries.delete(id);
        throw error;
      },
    );
    return entry.promise;
  }
  function has(userId, key, { version = '' } = {}) {
    const id = cacheKey(userId, key, version), entry = entries.get(id);
    if (!entry || entry.status !== 'ready') return false;
    if (fresh(entry)) return true;
    entries.delete(id);
    return false;
  }
  function clear() {
    generation += 1;
    entries.clear();
  }
  return { get, has, clear };
}

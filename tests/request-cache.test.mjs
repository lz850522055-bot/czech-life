import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestCache } from '../app/public/request-cache.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('user, endpoint and version are independent, including separator characters', async () => {
  const cache = createRequestCache();
  let loads = 0;
  const get = (user, key, version) => cache.get(user, key, () => ++loads, { version });
  assert.equal(await get('one', '/lesson', 'v1'), 1);
  assert.equal(await get('two', '/lesson', 'v1'), 2);
  assert.equal(await get('one', '/other', 'v1'), 3);
  assert.equal(await get('one', '/lesson', 'v2'), 4);
  assert.equal(await get('one', '/lesson', 'v1'), 1);
  assert.notEqual(await get('a:b', 'c', ''), await get('a', 'b:c', ''));
  assert.equal(loads, 6);
  assert.equal(cache.has('one', '/lesson', { version: 'v1' }), true);
  assert.equal(cache.has('three', '/lesson', { version: 'v1' }), false);
});

test('same-key concurrent requests share one promise and loader; pending is not a cache hit', async () => {
  const cache = createRequestCache(), request = deferred();
  let loads = 0;
  const one = cache.get('user', '/lesson', () => { loads += 1; return request.promise; });
  const two = cache.get('user', '/lesson', () => { throw new Error('must not run'); });
  assert.strictEqual(one, two);
  assert.equal(cache.has('user', '/lesson'), false);
  await Promise.resolve();
  assert.equal(loads, 1);
  const value = { fullText: 'unchanged content' };
  request.resolve(value);
  assert.strictEqual(await one, value);
  assert.strictEqual(await two, value);
  assert.equal(cache.has('user', '/lesson'), true);
  assert.strictEqual(await cache.get('user', '/lesson', () => null), value);
});

test('clear makes completed entries unavailable and prevents old in-flight success from repopulating', async () => {
  const cache = createRequestCache(), old = deferred();
  await cache.get('user', '/ready', () => 'cached');
  const pending = cache.get('user', '/pending', () => old.promise);
  cache.clear();
  assert.equal(cache.has('user', '/ready'), false);
  old.resolve('old');
  assert.equal(await pending, 'old');
  assert.equal(cache.has('user', '/pending'), false);
  assert.equal(await cache.get('user', '/pending', () => 'fresh'), 'fresh');
});

test('old request resolving after clear cannot replace a newer pending request', async () => {
  const cache = createRequestCache(), old = deferred(), replacement = deferred();
  const oldPromise = cache.get('user', '/lesson', () => old.promise);
  cache.clear();
  const newPromise = cache.get('user', '/lesson', () => replacement.promise);
  old.resolve('old');
  assert.equal(await oldPromise, 'old');
  assert.strictEqual(cache.get('user', '/lesson', () => 'must not load'), newPromise);
  replacement.resolve('new');
  assert.equal(await newPromise, 'new');
  assert.equal(await cache.get('user', '/lesson', () => 'must not load'), 'new');
});

test('old completion after clear cannot overwrite an already completed replacement', async () => {
  const cache = createRequestCache(), old = deferred();
  const oldPromise = cache.get('user', '/lesson', () => old.promise);
  cache.clear();
  assert.equal(await cache.get('user', '/lesson', () => 'new'), 'new');
  old.resolve('late old value');
  assert.equal(await oldPromise, 'late old value');
  assert.equal(await cache.get('user', '/lesson', () => 'must not load'), 'new');
});

test('old request rejecting after clear cannot delete its newer replacement', async () => {
  const cache = createRequestCache(), old = deferred(), replacement = deferred();
  const oldPromise = cache.get('user', '/lesson', () => old.promise);
  const rejected = assert.rejects(oldPromise, /old failed/);
  cache.clear();
  const newPromise = cache.get('user', '/lesson', () => replacement.promise);
  old.reject(new Error('old failed'));
  await rejected;
  assert.strictEqual(cache.get('user', '/lesson', () => 'must not load'), newPromise);
  replacement.resolve('new');
  assert.equal(await newPromise, 'new');
  assert.equal(cache.has('user', '/lesson'), true);
});

test('all rejected loads, including 401 and 403, are not cached and allow retry', async () => {
  for (const status of [undefined, 401, 403, 500]) {
    const cache = createRequestCache(), failure = Object.assign(new Error('request failed'), { status });
    let attempts = 0;
    const loader = () => { if (++attempts === 1) throw failure; return 'retry succeeded'; };
    await assert.rejects(cache.get('user', '/lesson', loader), error => error === failure);
    assert.equal(cache.has('user', '/lesson'), false);
    assert.equal(await cache.get('user', '/lesson', loader), 'retry succeeded');
    assert.equal(attempts, 2);
  }
});

test('TTL starts when loading finishes, expires exactly at its limit, and has removes expired values', async () => {
  let clock = 0, calls = 0;
  const cache = createRequestCache({ defaultMaxAgeMs: 100, now: () => clock }), waiting = deferred();
  const result = cache.get('user', '/lesson', () => waiting.promise);
  clock = 500;
  waiting.resolve('slow request');
  await result;
  clock = 599;
  assert.equal(cache.has('user', '/lesson'), true);
  assert.equal(await cache.get('user', '/lesson', () => ++calls), 'slow request');
  clock = 600;
  assert.equal(cache.has('user', '/lesson'), false);
  assert.equal(await cache.get('user', '/lesson', () => ++calls), 1);
});

test('per-request TTL honors a stricter caller; zero age still coalesces in-flight work', async () => {
  let clock = 0;
  const cache = createRequestCache({ now: () => clock });
  await cache.get('user', '/lesson', () => 'old', { maxAgeMs: 100 });
  clock = 11;
  assert.equal(await cache.get('user', '/lesson', () => 'fresh', { maxAgeMs: 10 }), 'fresh');
  const request = deferred();
  const one = cache.get('user', '/zero', () => request.promise, { maxAgeMs: 0 });
  assert.strictEqual(cache.get('user', '/zero', () => 'duplicate', { maxAgeMs: 0 }), one);
  request.resolve('one');
  await one;
  assert.equal(cache.has('user', '/zero'), false);
  assert.equal(await cache.get('user', '/zero', () => 'two', { maxAgeMs: 0 }), 'two');
});

test('default capacity is 24 and get updates LRU ordering without changing content', async () => {
  const cache = createRequestCache();
  for (let i = 0; i < 24; i += 1) await cache.get('user', '/'+i, () => i);
  assert.equal(await cache.get('user', '/0', () => 'wrong'), 0);
  await cache.get('user', '/24', () => 24);
  assert.equal(cache.has('user', '/0'), true);
  assert.equal(cache.has('user', '/1'), false);
  assert.equal(cache.has('user', '/24'), true);
  assert.equal(Array.from({ length: 25 }, (_, i) => cache.has('user', '/'+i)).filter(Boolean).length, 24);
});

test('LRU bounds pending entries too; late evicted results cannot overwrite replacements', async () => {
  const cache = createRequestCache({ maxEntries: 2 }), old = deferred();
  const oldPromise = cache.get('user', '/a', () => old.promise);
  await cache.get('user', '/b', () => 'b');
  await cache.get('user', '/c', () => 'c');
  assert.equal(await cache.get('user', '/a', () => 'replacement'), 'replacement');
  old.resolve('old result');
  assert.equal(await oldPromise, 'old result');
  assert.equal(await cache.get('user', '/a', () => 'wrong'), 'replacement');
  assert.equal(cache.has('user', '/b'), false);
  assert.equal(cache.has('user', '/c'), true);
});

test('invalid account, key, version, TTL and oversized capacity fail explicitly', () => {
  const cache = createRequestCache();
  assert.throws(() => cache.get('', '/lesson', () => 1), /userId/);
  assert.throws(() => cache.has(null, '/lesson'), /userId/);
  assert.throws(() => cache.get('user', '', () => 1), /key/);
  assert.throws(() => cache.get('user', '/lesson', () => 1, { version: 1 }), /version/);
  assert.throws(() => cache.get('user', '/lesson', () => 1, { maxAgeMs: -1 }), /maxAgeMs/);
  assert.throws(() => cache.get('user', '/lesson', null), /loader/);
  assert.throws(() => createRequestCache({ maxEntries: 25 }), /maxEntries/);
  assert.throws(() => createRequestCache({ defaultMaxAgeMs: Infinity }), /maxAgeMs/);
});


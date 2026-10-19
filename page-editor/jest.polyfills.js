/**
 * jsdom does not expose `structuredClone`, so any source module that uses it
 * would throw under test even though every browser we target supports it.
 * Node's v8 serializer performs a true structured clone (Dates, Maps, Sets and
 * cycles all survive), which is close enough for test purposes.
 */
const v8 = require('node:v8');

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}

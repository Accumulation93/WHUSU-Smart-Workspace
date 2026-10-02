'use strict';

class BoundedCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 256;
    this.maxBytes = options.maxBytes || 16 * 1024 * 1024;
    this.maxItemBytes = options.maxItemBytes || 1024 * 1024;
    this.items = new Map();
    this.inflight = new Map();
    this.bytes = 0;
  }

  delete(key) {
    const item = this.items.get(key);
    if (item) { this.bytes -= item.bytes; this.items.delete(key); }
  }

  get(key, now = Date.now()) {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expiresAt <= now) { this.delete(key); return null; }
    this.items.delete(key);
    this.items.set(key, item);
    // 调用方的时间标注和展示修饰不得污染下一次命中。
    return JSON.parse(item.buffer.toString('utf8'));
  }

  set(key, value, expiresAt) {
    if (expiresAt <= Date.now()) return;
    const json = JSON.stringify(value);
    const bytes = Buffer.byteLength(json) + key.length * 2 + 128;
    if (bytes > this.maxItemBytes || bytes > this.maxBytes) return;
    this.delete(key);
    while (this.items.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      this.delete(this.items.keys().next().value);
    }
    this.items.set(key, { buffer: Buffer.from(json), bytes, expiresAt });
    this.bytes += bytes;
  }

  async load(key, loader, options = {}) {
    if (!options.refresh) {
      const hit = this.get(key);
      if (hit !== null) return hit;
    }
    if (this.inflight.has(key)) return JSON.parse(JSON.stringify(await this.inflight.get(key)));
    const started = Date.now();
    const pending = Promise.resolve().then(loader).then(value => {
      if (!options.cacheable || options.cacheable(value)) {
        const boundary = options.expiresAt ? options.expiresAt(value) : Infinity;
        this.set(key, value, Math.min(started + (options.ttlMs || 5000), boundary));
      }
      return value;
    });
    // 在途键也有上限；超出容量仍受业务读取并发限制，但不再登记键。
    const tracked = !this.inflight.has(key) && this.inflight.size < this.maxEntries;
    if (tracked) this.inflight.set(key, pending);
    try { return await pending; } finally {
      if (this.inflight.get(key) === pending) this.inflight.delete(key);
    }
  }
}

module.exports = { BoundedCache };

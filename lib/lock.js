"use strict";

/**
 * Tiny cross-process file lock (no dependencies).
 * Uses an exclusive create (O_EXCL) of a lock file holding {pid, at, token}.
 * A lock is stale when its holder process is gone or it is older than staleMs.
 */

const fs = require("fs");
const crypto = require("crypto");

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(sleepCell, 0, 0, Math.max(1, ms));
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function readLock(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const info = JSON.parse(raw);
    return { raw, info };
  } catch (err) {
    return null;
  }
}

function isStale(file, staleMs) {
  const cur = readLock(file);
  if (!cur) {
    // Empty or half-written lock: stale only once it is old.
    try {
      return Date.now() - fs.statSync(file).mtimeMs > Math.min(staleMs, 5000) ? "" : null;
    } catch (err) {
      return null;
    }
  }
  const age = Date.now() - Number(cur.info.at || 0);
  if (!pidAlive(cur.info.pid) || age > staleMs) return cur.raw;
  return null;
}

/**
 * Acquire a lock synchronously.
 * opts.timeoutMs (default 10000): give up and return null after this long. 0 = try once.
 * opts.staleMs (default 30000): break locks older than this or held by a dead pid.
 * Returns a release() function, or null when the lock could not be taken.
 */
function acquire(file, opts) {
  const timeoutMs = opts && opts.timeoutMs != null ? opts.timeoutMs : 10000;
  const staleMs = (opts && opts.staleMs) || 30000;
  const token = crypto.randomBytes(8).toString("hex");
  const body = JSON.stringify({ pid: process.pid, at: Date.now(), token });
  const start = Date.now();
  let wait = 2;
  for (;;) {
    try {
      const fd = fs.openSync(file, "wx", 0o644);
      try {
        fs.writeSync(fd, body);
      } finally {
        fs.closeSync(fd);
      }
      let released = false;
      return function release() {
        if (released) return;
        released = true;
        const cur = readLock(file);
        if (cur && cur.info.token === token) {
          try {
            fs.unlinkSync(file);
          } catch (err) {
            /* already gone */
          }
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const staleRaw = isStale(file, staleMs);
    if (staleRaw != null) {
      // Re-check the same holder right before breaking it, to avoid removing a fresh lock.
      const again = readLock(file);
      if ((again ? again.raw : "") === staleRaw) {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          /* someone else broke it */
        }
        continue;
      }
    }
    if (Date.now() - start >= timeoutMs) return null;
    sleepSync(wait + Math.floor(Math.random() * wait));
    wait = Math.min(wait * 2, 50);
  }
}

module.exports = { acquire, sleepSync, pidAlive };

function createJsonLineParser(onJson, onRaw) {
  let buf = '';

  function handle(line) {
    const text = String(line || '').trim();
    if (!text) return;
    try {
      onJson(JSON.parse(text));
    } catch {
      if (onRaw) onRaw(text);
    }
  }

  return {
    push(chunk) {
      buf += chunk == null ? '' : chunk.toString('utf8');
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        handle(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
      }
    },
    flush() {
      if (buf) handle(buf);
      buf = '';
    },
  };
}

module.exports = { createJsonLineParser };

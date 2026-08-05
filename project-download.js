function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function concatBytes(parts) { const size = parts.reduce((total, part) => total + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function zipStore(files) { const encoder = new TextEncoder(); const localParts = []; const centralParts = []; let offset = 0; for (const file of files) { const name = encoder.encode(file.name); const data = file.data; const crc = crc32(data); const local = new Uint8Array(30 + name.length + data.length); const view = new DataView(local.buffer); view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length); localParts.push(local); const central = new Uint8Array(46 + name.length); const c = new DataView(central.buffer); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46); centralParts.push(central); offset += local.length; } const central = concatBytes(centralParts); const footer = new Uint8Array(22); const view = new DataView(footer.buffer); view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, central.length, true); view.setUint32(16, offset, true); return new Blob([concatBytes([...localParts, central, footer])], { type: 'application/zip' }); }
window.downloadProjectArchive = async (title, tasks) => {
  const completed = tasks.filter(task => task.status === '已完成' && (task.url || task.copyTitle || task.copyDescription || task.description || task.mode === '文案改写'));
  if (!completed.length) throw new Error('项目中还没有可下载的结果');
  const encoder = new TextEncoder(); const files = []; let imageIndex = 0; let copyIndex = 0;
  for (const task of completed) {
    if (task.url) {
      imageIndex += 1;
      const response = await fetch(task.url); if (!response.ok) throw new Error(`第 ${imageIndex} 张成图下载失败`);
      files.push({ name: `images/image-${String(imageIndex).padStart(2, '0')}.png`, data: new Uint8Array(await response.arrayBuffer()) });
    }
    if (task.mode === '文案改写' || task.copyTitle || task.copyDescription || task.description) {
      copyIndex += 1;
      const copyText = `标题\n${task.copyTitle || task.title || ''}\n\n正文\n${task.copyDescription || task.description || ''}\n`;
      files.push({ name: `copy/copy-${String(copyIndex).padStart(2, '0')}.txt`, data: encoder.encode(`\uFEFF${copyText}`) });
    }
  }
  const download = document.createElement('a'); const url = URL.createObjectURL(zipStore(files)); download.href = url; download.download = `${(title || '项目').replace(/[\\/:*?"<>|]/g, '_')}.zip`; download.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

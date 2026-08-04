import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 4178);
const publicDir = join(process.cwd(), 'public');
const jobs = new Map();
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}

function buildScene(input) {
  const title = input.title?.trim() || '新品上市 · 轻盈出行';
  const subtitle = input.subtitle?.trim() || '为日常留一点恰到好处的松弛感';
  const sellingPoints = (input.sellingPoints || '轻量设计\n细节耐看\n限时上新').split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const elements = [
    { id: 'background', type: 'rect', name: '背景色', x: 0, y: 0, width: 1242, height: 1660, color: '#F6F1EA' },
    { id: 'accent', type: 'rect', name: '装饰色块', x: 0, y: 0, width: 1242, height: 340, color: '#20352D' },
    { id: 'eyebrow', type: 'text', name: '栏目标签', x: 86, y: 86, width: 700, content: 'LIFESTYLE / NEW ARRIVAL', fontSize: 25, color: '#CFE2C6' },
    { id: 'title', type: 'text', name: '主标题', x: 82, y: 140, width: 1030, content: title, fontSize: 78, color: '#FFFFFF' },
    { id: 'subtitle', type: 'text', name: '副标题', x: 86, y: 250, width: 920, content: subtitle, fontSize: 31, color: '#E5EEE0' },
  ];
  if (input.productImage) elements.push({ id: 'product', type: 'image', name: '商品主图（可替换）', x: 82, y: 430, width: 1078, height: 780, url: input.productImage });
  else elements.push({ id: 'product-placeholder', type: 'rect', name: '商品主图占位（请替换）', x: 82, y: 430, width: 1078, height: 780, color: '#D8DDD2' });
  sellingPoints.forEach((point, index) => elements.push({ id: `point-${index}`, type: 'text', name: `卖点 ${index + 1}`, x: 100, y: 1300 + index * 78, width: 980, content: `${String(index + 1).padStart(2, '0')}  ${point}`, fontSize: 36, color: '#20352D' }));
  elements.push({ id: 'cta', type: 'text', name: '行动文案', x: 86, y: 1550, width: 800, content: '点击收藏，开启今日灵感', fontSize: 27, color: '#6E746B' });
  return { version: 1, name: `${title.slice(0, 16)} 小红书图`, canvas: { width: 1242, height: 1660 }, elements };
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    try {
      const input = await body(req);
      const id = crypto.randomUUID();
      const scene = buildScene(input);
      jobs.set(id, { id, createdAt: new Date().toISOString(), input, scene });
      return json(res, 201, { id, scene, mastergoImportUrl: `/api/jobs/${id}/scene` });
    } catch { return json(res, 400, { error: '无法读取任务数据' }); }
  }
  const match = url.pathname.match(/^\/api\/jobs\/([^/]+)\/scene$/);
  if (req.method === 'GET' && match) {
    const job = jobs.get(match[1]);
    return job ? json(res, 200, job.scene) : json(res, 404, { error: '任务不存在。请在网页中重新生成。' });
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const file = normalize(join(publicDir, requested));
  if (!file.startsWith(publicDir)) return json(res, 403, { error: '禁止访问' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { json(res, 404, { error: '页面不存在' }); }
}).listen(port, () => console.log(`AI MasterGo Studio: http://localhost:${port}`));

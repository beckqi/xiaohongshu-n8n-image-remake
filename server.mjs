
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const n8nWebhookUrl = process.env.N8N_APP_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL || 'http://127.0.0.1:5678/webhook/poster-remake';
const runtimeEnvPath = process.env.RUNTIME_ENV_PATH || join(root, 'data', 'runtime.env');
const ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8000';
const imageWorkerUrl = process.env.IMAGE_WORKER_URL || 'http://127.0.0.1:8001';
const usersPath = join(root, 'data', 'users.json');
const historyDirectory = join(root, 'data', 'history');
const sessions = new Map();
const loginAttempts = new Map();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) reject(new Error('图片过大，最大支持 8MB'));
      else parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function parseEnv(content) {
  return Object.fromEntries(content.split(/\r?\n/).map(line => {
    const found = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    return found ? [found[1], found[2]] : null;
  }).filter(Boolean));
}

function mask(value) {
  return value ? `已保存（末尾 ${value.slice(-4)}）` : '';
}

function imageApiBase(env) {
  let base = String(env.YUNWU_BASE_URL || '').replace(/\/$/, '');
  try {
    const parsed = new URL(base);
    if (parsed.hostname === 'api.lk888.ai' && !parsed.pathname.replace(/\/$/, '').endsWith('/v1')) base += '/v1';
  } catch { /* Keep the configured value so the provider can return a clear error. */ }
  return base;
}

async function ensureLingkeBalance(env) {
  const base = imageApiBase(env);
  if (!base.includes('api.lk888.ai')) return;
  const response = await fetch(`${base}/skills/balance`, { headers: { authorization: `Bearer ${env.YUNWU_API_KEY}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || '灵境余额查询失败');
  if (Number(data.balance) <= 0) throw new Error('灵境算力余额不足，请先充值');
}

function readCookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key)); }
function hashPassword(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, encoded) { const [salt, expected] = String(encoded || '').split(':'); if (!salt || !expected) return false; const actual = scryptSync(password, salt, 64); return actual.length === Buffer.from(expected, 'hex').length && timingSafeEqual(actual, Buffer.from(expected, 'hex')); }
async function loadUsers() { try { return JSON.parse(await readFile(usersPath, 'utf8')); } catch { return []; } }
async function saveUsers(users) { await mkdir(dirname(usersPath), { recursive: true }); await writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8'); }
async function saveGeneratedImage(image) { const name = `${Date.now()}-${randomBytes(8).toString('hex')}.png`; await mkdir(historyDirectory, { recursive: true }); await writeFile(join(historyDirectory, name), image); return `/api/history/${name}`; }
function currentUser(req) { const token = readCookies(req).om_session; const session = token && sessions.get(token); if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; } return session.user; }
function setSession(res, username) { const token = randomBytes(32).toString('hex'); sessions.set(token, { user: { username }, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }); const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''; res.setHeader('set-cookie', `om_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`); }
function clearSession(req, res) { const token = readCookies(req).om_session; if (token) sessions.delete(token); res.setHeader('set-cookie', 'om_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function checkLoginLimit(req, username) {
  const now = Date.now(); const key = `${clientIp(req)}:${String(username).trim().toLowerCase()}`; const record = loginAttempts.get(key);
  if (!record) return { key, retryAfter: 0 };
  if (record.blockedUntil > now) return { key, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
  record.failures = record.failures.filter(time => now - time < 10 * 60 * 1000);
  return { key, retryAfter: 0 };
}
function recordLoginFailure(key) { const now = Date.now(); const record = loginAttempts.get(key) || { failures: [], blockedUntil: 0 }; record.failures = record.failures.filter(time => now - time < 10 * 60 * 1000); record.failures.push(now); if (record.failures.length >= 5) { record.blockedUntil = now + 15 * 60 * 1000; record.failures = []; } loginAttempts.set(key, record); }
function clearLoginFailures(key) { loginAttempts.delete(key); }

function readMetaTags(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const entries = tags.map(tag => {
    const name = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    return name && content ? [name, content.replace(/&amp;/g, '&')] : null;
  }).filter(Boolean);
  return Object.fromEntries(entries);
}

function isXhsHost(value) {
  try { const host = new URL(value).hostname.toLowerCase(); return host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com'); }
  catch { return false; }
}

function isXhsImageHost(value) {
  try { const host = new URL(value).hostname.toLowerCase(); return host.endsWith('.xhscdn.com') || host.endsWith('.xiaohongshu.com'); }
  catch { return false; }
}

async function loadRuntimeEnv() {
  try { return { ...process.env, ...parseEnv(await readFile(runtimeEnvPath, 'utf8')) }; }
  catch { return { ...process.env }; }
}

async function createYunwuBackground(payload, env) {
  const match = String(payload.imageData || '').match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match || !env.YUNWU_API_KEY || !env.YUNWU_BASE_URL) throw new Error('灵境图像设置未完成');
  await ensureLingkeBalance(env);
  const copy = payload.copy || {};
  const similarity = Math.min(100, Math.max(0, Number(payload.similarity ?? 60)));
  const generationCount = Math.min(10, Math.max(1, Math.round(Number(payload.generationCount ?? 1))));
  const outputSize = { source: 'auto', portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' }[payload.imageRatio] || '1024x1536';
  if (['layout', 'rewrite', 'rebuild', 'free'].includes(payload.mode)) {
    const creativeDirection = {
      layout: '保留参考图所表达的内容主题，但完全由你重新决定构图和文字排版，不要照抄原图版式。',
      rewrite: '用更有吸引力的营销表达呈现以下信息，并由你自由决定构图和文字排版。',
      rebuild: '仅保留核心信息，重新创造场景、主体、色彩、装饰与全部文字排版，使成图与参考图明显不同。',
      free: '不受参考图版式约束，自由决定构图、主体位置、字体风格、字号、色彩、装饰元素和文案层级。',
    }[payload.mode];
    const similarityDirection = similarity >= 95
      ? `目标视觉相似度约 ${similarity}%，这是最高优先级：几乎完全保留原图的主体、构图、镜头关系、主要色调、画面分区和视觉层级，只允许微调局部颜色、纹理、小装饰和细微背景元素；不要重新构图或替换主体。`
      : similarity >= 90
        ? `目标视觉相似度约 ${similarity}%，这是最高优先级：保留原图的主体、构图、主要色调、画面分区和视觉关系，只做轻微变化，例如替换少量小装饰、局部配色和背景细节；不要做明显的场景或版式重构。`
      : similarity >= 75
        ? `目标视觉相似度约 ${similarity}%，保留原图的核心主题、氛围、主体类型和主要色调，但仍使用新构图。`
      : similarity <= 35
        ? `目标视觉相似度约 ${similarity}%，大胆改变场景、主体、色彩、构图和视觉语言，仅保留内容主题。`
        : `目标视觉相似度约 ${similarity}%，保留内容主题与部分氛围，但明显改变构图、配色和装饰细节。`;
    const copyLines = [`主标题「${copy.title || ''}」`, ...(copy.subtitle?.trim() ? [`副标题「${copy.subtitle.trim()}」`] : []), ...(copy.benefits?.length ? [`卖点「${copy.benefits.join('、')}」`] : [])].join('；');
    const subtitleRule = copy.subtitle?.trim() ? '' : '不要自行添加副标题、次级标题或额外文案。';
    const prompt = `以参考图为内容灵感，重新创作一张完成度很高的中文竖版营销海报。${creativeDirection} ${similarityDirection} 不要沿用参考图的 Logo、水印、认证章或品牌标识。请在海报中自然排入以下文案：${copyLines}。${subtitleRule} 不要解释，只输出最终海报图片。`;
    const form = new FormData();
    form.append('image', new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }), 'source.png');
    form.append('prompt', prompt);
    form.append('model', env.YUNWU_IMAGE_MODEL || 'gpt-image-2');
    form.append('n', String(generationCount));
    form.append('size', outputSize);
    form.append('quality', 'auto');
    const endpoint = `${imageApiBase(env)}${env.YUNWU_IMAGE_EDIT_PATH || '/images/edits'}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { accept: 'application/json', authorization: `Bearer ${env.YUNWU_API_KEY}` }, body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || '灵境图像生成失败');
    const items = Array.isArray(data.data) ? data.data : [data.data];
    const images = items.map(item => item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url).filter(Boolean);
    if (generationCount > 1 && images.length) return images;
    const item = items[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item?.url) return item.url;
    throw new Error('灵境未返回图片数据');
  }
  const modeHint = payload.mode === 'rebuild'
    ? '重新设计场景、构图、主色与装饰元素，使视觉风格明显不同。'
    : '保留可用的非文字视觉主题与商品/人物信息，但重新绘制干净背景。';
  const prompt = `${modeHint} 删除画面中所有文字、数字、Logo、水印、认证章和品牌标识。生成 4:5 竖版无文字海报背景：上方 42% 保持干净、明亮、低细节，作为标题区；主体安排在画面中部；底部 26% 保持干净，作为卖点区。不要添加任何字符、标签、边框或排版。`;
  const form = new FormData();
  form.append('image', new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }), 'source.png');
  form.append('prompt', prompt);
  form.append('model', env.YUNWU_IMAGE_MODEL || 'gpt-image-2');
  form.append('n', '1');
  form.append('size', '1024x1536');
  form.append('quality', 'auto');
  const endpoint = `${imageApiBase(env)}${env.YUNWU_IMAGE_EDIT_PATH || '/images/edits'}`;
  const response = await fetch(endpoint, { method: 'POST', headers: { accept: 'application/json', authorization: `Bearer ${env.YUNWU_API_KEY}` }, body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || '灵境图像生成失败');
  const item = Array.isArray(data.data) ? data.data[0] : data.data;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error('灵境未返回图片数据');
}

async function washImportedCopy(payload, env) {
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const similarity = Math.min(100, Math.max(0, Number(payload.similarity ?? 70)));
  if (!title && !description) throw new Error('请先导入标题或文案');
  if (!env.MIMO_API_KEY || !env.MIMO_BASE_URL) throw new Error('请先在 API 设置中填写小米 Mimo API Key');
  const direction = similarity >= 90
    ? '只做极轻微的语序、标点和可读性润色，核心措辞、信息顺序和语气必须几乎不变。'
    : similarity >= 70
      ? '保留原有主题、卖点、事实和语气，可优化表达节奏与结构，但不能改变信息含义。'
      : similarity >= 40
        ? '保留主题及全部事实卖点，用全新的叙述结构和表达方式改写，使读感明显不同。'
        : '只保留真实主题和事实卖点，重新设计标题与正文的表达角度和节奏。';
  const prompt = `你是资深小红书笔记文案编辑。用户拥有以下内容的使用权，需要生成一个可直接发布的“小红书风格”改写版本。${direction} 标题要自然、有具体信息点或轻钩子，不要标题党；正文使用轻松口语化的中文，开头先点明读者收益，随后用短段落、换行和少量 emoji（每段最多 1 个）提升可读性；必要时以「适合谁」「包含什么」「怎么用」这类小标题或清单组织内容；结尾给出自然、不过度营销的互动或行动引导。保留原文的事实、对象、年级、版本、资料内容等关键信息。不得添加原文没有的价格、承诺、资质、数据、稀缺性或夸大性结论；不要写“爆款”“闭眼入”“私信我”等强营销话术；不得提及洗稿、相似度或 AI。输出严格 JSON，不要 Markdown：{"title":"...","description":"..."}。\n原始标题：${title || '（无）'}\n原始正文：${description || '（无）'}`;
  const endpoint = `${env.MIMO_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.MIMO_API_KEY}` },
    body: JSON.stringify({ model: env.MIMO_MODEL || 'mimo-v2.5', temperature: Math.max(0.15, Math.min(0.95, (100 - similarity) / 100 + 0.2)), messages: [{ role: 'system', content: '你只返回合法 JSON。' }, { role: 'user', content: prompt }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || data?.message || 'Mimo 文案生成失败');
  const content = String(data?.choices?.[0]?.message?.content || '').replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error('Mimo 返回格式异常，请重新生成'); }
  return { title: String(parsed.title || title).trim(), description: String(parsed.description || description).trim(), similarity };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (process.env.COOKIE_SECURE === 'true') res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const { username = '', password = '' } = JSON.parse((await readBody(req, 32 * 1024)).toString('utf8'));
      const cleanName = String(username).trim(); const cleanPassword = String(password);
      if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,24}$/.test(cleanName)) return json(res, 400, { error: '账号需为 3–24 位中文、字母、数字或下划线' });
      if (cleanPassword.length < 8) return json(res, 400, { error: '密码至少需要 8 位' });
      const users = await loadUsers();
      if (users.some(user => user.username.toLowerCase() === cleanName.toLowerCase())) return json(res, 409, { error: '该账号已存在，请直接登录' });
      users.push({ username: cleanName, passwordHash: hashPassword(cleanPassword), createdAt: new Date().toISOString() }); await saveUsers(users); setSession(res, cleanName);
      return json(res, 201, { ok: true, user: { username: cleanName } });
    } catch (error) { return json(res, 400, { error: error.message || '注册失败' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const { username = '', password = '' } = JSON.parse((await readBody(req, 32 * 1024)).toString('utf8'));
      const attempt = checkLoginLimit(req, username);
      if (attempt.retryAfter) { res.setHeader('retry-after', String(attempt.retryAfter)); return json(res, 429, { error: `尝试次数过多，请 ${Math.ceil(attempt.retryAfter / 60)} 分钟后再试` }); }
      const user = (await loadUsers()).find(item => item.username.toLowerCase() === String(username).trim().toLowerCase());
      if (!user || !verifyPassword(String(password), user.passwordHash)) { recordLoginFailure(attempt.key); return json(res, 401, { error: '账号或密码不正确' }); }
      clearLoginFailures(attempt.key);
      setSession(res, user.username); return json(res, 200, { ok: true, user: { username: user.username } });
    } catch (error) { return json(res, 400, { error: error.message || '登录失败' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { clearSession(req, res); return json(res, 200, { ok: true }); }
  if (req.method === 'GET' && url.pathname === '/api/auth/session') { const user = currentUser(req); return user ? json(res, 200, { user }) : json(res, 401, { error: '未登录' }); }
  const publicFiles = new Set(['/login.html', '/login.js', '/login.css']);
  if (!currentUser(req)) {
    if (url.pathname.startsWith('/api/')) return json(res, 401, { error: '登录已失效，请重新登录' });
    if (!publicFiles.has(url.pathname)) { res.writeHead(302, { location: '/login.html' }); return res.end(); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/history/')) {
    const name = url.pathname.slice('/api/history/'.length);
    if (!/^[a-z0-9-]+\.png$/i.test(name)) return json(res, 400, { error: '无效的历史文件' });
    try { const image = await readFile(join(historyDirectory, name)); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=31536000, immutable' }); return res.end(image); }
    catch { return json(res, 404, { error: '历史文件不存在' }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const env = await loadRuntimeEnv();
    return json(res, 200, {
      yunwuApiKey: mask(env.YUNWU_API_KEY),
      yunwuBaseUrl: env.YUNWU_BASE_URL || '',
      yunwuImageEditPath: env.YUNWU_IMAGE_EDIT_PATH || '/images/edits',
      yunwuImageModel: env.YUNWU_IMAGE_MODEL || 'gpt-image-2',
      mimoApiKey: mask(env.MIMO_API_KEY),
      mimoBaseUrl: env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1',
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    try {
      const incoming = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8'));
      const env = await loadRuntimeEnv();
      const mappings = {
        yunwuApiKey: 'YUNWU_API_KEY', yunwuBaseUrl: 'YUNWU_BASE_URL', yunwuImageEditPath: 'YUNWU_IMAGE_EDIT_PATH', yunwuImageModel: 'YUNWU_IMAGE_MODEL',
        mimoApiKey: 'MIMO_API_KEY', mimoBaseUrl: 'MIMO_BASE_URL',
      };
      for (const [field, key] of Object.entries(mappings)) {
        if (incoming[field] === null) { delete env[key]; continue; }
        if (typeof incoming[field] === 'string' && incoming[field].trim() && !incoming[field].startsWith('已保存')) env[key] = incoming[field].trim();
      }
      env.MIMO_MODEL = env.MIMO_MODEL || 'mimo-v2.5';
      env.YUNWU_IMAGE_MODEL = env.YUNWU_IMAGE_MODEL || 'gpt-image-2';
      const content = Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
      await writeFile(runtimeEnvPath, content, 'utf8');
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: error.message || '设置保存失败' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/wash-copy') {
    try {
      const payload = JSON.parse((await readBody(req, 128 * 1024)).toString('utf8'));
      return json(res, 200, await washImportedCopy(payload, await loadRuntimeEnv()));
    } catch (error) { return json(res, 502, { error: error.message || '文案生成失败' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/import-link') {
    try {
      const { link } = JSON.parse((await readBody(req, 128 * 1024)).toString('utf8'));
      if (!isXhsHost(link)) return json(res, 400, { error: '目前仅支持小红书公开链接' });
      const page = await fetch(link, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36', accept: 'text/html' }, redirect: 'follow' });
      if (!page.ok) return json(res, 502, { error: `链接读取失败（${page.status}）` });
      const html = await page.text();
      const metas = readMetaTags(html);
      const images = [...html.matchAll(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["']/gi)].map(match => match[1].replace(/&amp;/g, '&')).filter(Boolean);
      const safeImages = [...new Set(images.map(image => image.startsWith('//') ? `https:${image}` : image).filter(isXhsImageHost))].slice(0, 20);
      if (!safeImages.length) return json(res, 422, { error: '未发现可导入图片；该链接可能需要在浏览器中登录后访问' });
      return json(res, 200, { title: (metas['og:title'] || '').replace(/\s*-\s*小红书\s*$/i, ''), description: metas['og:description'] || '', images: safeImages, canonical: metas['og:url'] || link });
    } catch (error) { return json(res, 502, { error: error.message || '链接导入失败' }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/import-image') {
    const imageUrl = url.searchParams.get('url') || '';
    if (!isXhsImageHost(imageUrl)) return json(res, 400, { error: '不支持的图片地址' });
    try {
      const image = await fetch(imageUrl, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!image.ok) return json(res, 502, { error: '图片下载失败' });
      const data = Buffer.from(await image.arrayBuffer());
      res.writeHead(200, { 'content-type': image.headers.get('content-type') || 'image/jpeg' });
      return res.end(data);
    } catch (error) { return json(res, 502, { error: error.message || '图片下载失败' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/ocr') {
    try {
      const payload = JSON.parse((await readBody(req)).toString('utf8'));
      const match = String(payload.imageData || '').match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
      if (!match) return json(res, 400, { error: '请上传有效图片' });
      const form = new FormData();
      form.append('image', new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }), 'poster.png');
      const result = await fetch(`${ocrServiceUrl}/ocr`, { method: 'POST', body: form });
      const data = await result.json();
      return json(res, result.ok ? 200 : 502, data);
    } catch (error) {
      return json(res, 502, { error: error.message || 'OCR 服务暂时不可用' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/rebuild') {
    let rebuildPayload;
    const localRender = async (payload, background = payload.imageData, source = 'local-fallback') => {
      const result = await fetch(`${imageWorkerUrl}/render`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ background, copy: payload.copy, layout: payload.layout || 'bold' }),
      });
      if (!result.ok) throw new Error('本机排版服务未就绪');
      const image = Buffer.from(await result.arrayBuffer());
      const imageUrl = await saveGeneratedImage(image);
      return json(res, 200, { images: [imageUrl], source });
    };
    try {
      const body = await readBody(req);
      rebuildPayload = JSON.parse(body.toString('utf8'));
      const env = await loadRuntimeEnv();
      if (env.YUNWU_API_KEY && env.YUNWU_BASE_URL) {
        try {
          const background = await createYunwuBackground(rebuildPayload, env);
          if (Array.isArray(background)) {
            const images = await Promise.all(background.map(async item => {
              const image = item.startsWith('data:image') ? Buffer.from(item.split(',', 2)[1], 'base64') : Buffer.from(await (await fetch(item)).arrayBuffer());
              return saveGeneratedImage(image);
            }));
            return json(res, 200, { images });
          }
          if (['layout', 'rewrite', 'rebuild', 'free'].includes(rebuildPayload.mode)) {
            const image = background.startsWith('data:image')
              ? Buffer.from(background.split(',', 2)[1], 'base64')
              : Buffer.from(await (await fetch(background)).arrayBuffer());
            return json(res, 200, { images: [await saveGeneratedImage(image)], source: 'lingke-gpt-image-2' });
          }
          return await localRender(rebuildPayload, background, 'yunwu-gpt-image-2');
        } catch (error) {
          return json(res, 502, { error: `灵境生成失败：${error.message || '请检查模型、余额或网络'}` });
        }
      }
      const result = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-original-maker': '1' },
        body,
      });
      const contentType = result.headers.get('content-type') || '';
      if (result.ok && contentType.startsWith('image/')) {
        const image = Buffer.from(await result.arrayBuffer());
        res.writeHead(200, { 'content-type': contentType, 'content-disposition': 'attachment; filename="remade-poster.png"' });
        return res.end(image);
      }
      return await localRender(rebuildPayload);
    } catch (error) {
      try {
        if (!rebuildPayload) throw error;
        return await localRender(rebuildPayload);
      } catch {
        return json(res, 502, { error: error.message || '无法生成海报' });
      }
    }
  }
  let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (file.startsWith('data/') || file.startsWith('data\\')) { res.writeHead(404); return res.end('Not found'); }
  file = normalize(file).replace(/^([.]{2}[\\/])+/g, '');
  try {
    const path = join(root, file);
    if ((await stat(path)).isDirectory()) file = 'index.html';
    const data = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`Original Maker is running at http://localhost:${port}`));
const linkImport = {
  open: document.querySelector('#importLink'), dialog: document.querySelector('#importDialog'), close: document.querySelector('#closeImport'), url: document.querySelector('#importUrl'), fetch: document.querySelector('#fetchImport'),
  result: document.querySelector('#importResult'), title: document.querySelector('#importTitle'), description: document.querySelector('#importDescription'), grid: document.querySelector('#importGrid'), queue: document.querySelector('#queueImport'), status: document.querySelector('#importStatus'),
  copySimilarity: document.querySelector('#copySimilarity'), copySimilarityValue: document.querySelector('#copySimilarityValue'), wash: document.querySelector('#washCopy'), washResult: document.querySelector('#washResult'), washedTitle: document.querySelector('#washedTitle'), washedDescription: document.querySelector('#washedDescription'), downloadCopy: document.querySelector('#downloadCopyTxt')
};

let importedImages = [];
let workspaceImportItems = [];
let activeImportIndex = 0;
let applyingImportedItem = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function setImportStatus(message) { linkImport.status.textContent = message; }
function drawImportedImages() {
  linkImport.grid.innerHTML = importedImages.map((url, index) => `<label class="import-image"><input type="checkbox" value="${index}" checked /><img src="/api/import-image?url=${encodeURIComponent(url)}" alt="导入图片 ${index + 1}" /><span>图片 ${index + 1}</span></label>`).join('');
}

linkImport.open.addEventListener('click', event => { event.preventDefault(); linkImport.dialog.showModal(); });
linkImport.close.addEventListener('click', () => linkImport.dialog.close());
linkImport.copySimilarity.addEventListener('input', () => { linkImport.copySimilarityValue.textContent = `${linkImport.copySimilarity.value}%`; });
linkImport.wash.addEventListener('click', async () => {
  const title = linkImport.title.value.trim(); const description = linkImport.description.value.trim();
  if (!title && !description) return setImportStatus('请先提取或填写标题、文案');
  linkImport.wash.classList.add('loading'); linkImport.wash.textContent = '正在生成改写文案…'; setImportStatus('Mimo 正在按目标相似度改写文案…');
  try {
    const response = await fetch('/api/wash-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description, similarity: Number(linkImport.copySimilarity.value) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '文案生成失败');
    linkImport.washedTitle.value = data.title || ''; linkImport.washedDescription.value = data.description || ''; linkImport.washResult.hidden = false;
    setImportStatus(`已生成改写文案（目标相似度 ${data.similarity}%），可编辑后下载 TXT。`);
  } catch (error) { setImportStatus(error.message || '文案生成失败'); }
  finally { linkImport.wash.classList.remove('loading'); linkImport.wash.textContent = '生成改写文案'; }
});
linkImport.downloadCopy.addEventListener('click', () => {
  const title = linkImport.washedTitle.value.trim(); const description = linkImport.washedDescription.value.trim();
  if (!title && !description) return setImportStatus('请先生成改写文案');
  const text = `标题\n${title}\n\n正文\n${description}\n`;
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' }));
  const download = document.createElement('a'); download.href = url; download.download = `小红书改写文案-${new Date().toISOString().slice(0, 10)}.txt`; download.click(); URL.revokeObjectURL(url);
  setImportStatus('TXT 文案已开始下载。');
});
linkImport.fetch.addEventListener('click', async () => {
  const link = linkImport.url.value.trim();
  if (!link) return setImportStatus('请先粘贴小红书公开链接');
  linkImport.fetch.classList.add('loading'); setImportStatus('正在提取公开文案和图片…');
  try {
    const response = await fetch('/api/import-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '提取失败');
    importedImages = data.images; linkImport.title.value = data.title || ''; linkImport.description.value = data.description || ''; linkImport.washResult.hidden = true; drawImportedImages(); linkImport.result.hidden = false; setImportStatus(`已提取 ${importedImages.length} 张图片，勾选后可加入队列。`);
  } catch (error) { setImportStatus(error.message || '提取失败'); }
  finally { linkImport.fetch.classList.remove('loading'); }
});

function setQueuedImage(file) {
  const transfer = new DataTransfer(); transfer.items.add(file); ui.file.files = transfer.files;
  const previewUrl = URL.createObjectURL(file);
  ui.source.src = previewUrl; ui.source.hidden = false; ui.empty.hidden = true; ui.status.textContent = '队列图片已加载';
  ui.originalPreview.src = previewUrl; ui.originalPreview.hidden = false; ui.sourceEmpty.hidden = true;
  ui.posterBg.hidden = true; ui.aiPlaceholder.hidden = false; ui.posterCopy.hidden = true; ui.modeLabel.hidden = true;
}

function renderImportTabs() {
  const tabs = document.querySelector('#importTabs');
  tabs.hidden = !workspaceImportItems.length;
  tabs.innerHTML = workspaceImportItems.map((item, index) => `<button class="import-tab ${index===activeImportIndex?'active':''}" data-index="${index}"><img src="${item.preview}" alt="带入图片 ${index+1}" /><span>图片 ${index+1}</span><small>${item.similarity ?? 60}% 相似${item.generationStatus ? ` · ${item.generationStatus}` : ''}</small></button>`).join('');
}

function activeImportItem() { return workspaceImportItems[activeImportIndex]; }
function syncActiveGenerationUI() {
  const running = activeImportItem()?.generationStatus === '生成中';
  ui.generate.classList.toggle('loading', running);
  ui.generate.querySelector('span').textContent = running ? 'AI 正在生成…' : '生成新海报';
  ui.note.lastElementChild.textContent = running ? '该图片正在队列中生成；可切换到其他图片继续提交。' : '准备就绪。预计生成 30–90 秒。';
}
window.getActiveImportedItem = activeImportItem;
window.refreshImportedGenerationUI = () => { renderImportTabs(); syncActiveGenerationUI(); };

function loadImportedItem(index) {
  const item = workspaceImportItems[index]; if (!item) return;
  activeImportIndex = index; applyingImportedItem = true; setQueuedImage(item.file);
  ui.title.value = item.title; ui.subtitle.value = ''; ui.benefits.value = item.description.slice(0, 180);
  ui.similarity.value = item.similarity ?? 60; updateSimilarityUI(); renderPreview(); renderImportTabs(); syncActiveGenerationUI();
  if (item.resultUrl) { ui.posterBg.src = item.resultUrl; ui.posterBg.hidden = false; ui.aiPlaceholder.hidden = true; }
  else if (item.generationStatus === '生成中') { ui.aiPlaceholder.hidden = false; ui.aiPlaceholder.querySelector('strong').textContent = '该图片正在生成中'; }
  applyingImportedItem = false; toast(`已切换到图片 ${index + 1}/${workspaceImportItems.length}，点击“生成新海报”才会生成`);
}

window.syncActiveImportedSimilarity = similarity => {
  const item = workspaceImportItems[activeImportIndex];
  if (!item) return;
  item.similarity = similarity;
  renderImportTabs();
};

document.querySelector('#importTabs').addEventListener('click', event => {
  const tab = event.target.closest('.import-tab'); if (!tab) return;
  loadImportedItem(Number(tab.dataset.index));
});

ui.file.addEventListener('change', () => {
  if (applyingImportedItem) return;
  workspaceImportItems = []; document.querySelector('#importTabs').hidden = true;
});

async function waitForGeneration() {
  await delay(80);
  while (ui.generate.classList.contains('loading')) await delay(500);
}

linkImport.queue.addEventListener('click', async () => {
  const selected = [...linkImport.grid.querySelectorAll('input:checked')].map(input => importedImages[Number(input.value)]).filter(Boolean);
  if (!selected.length) return setImportStatus('请至少选择一张图片');
  linkImport.queue.classList.add('loading');
  const title = linkImport.title.value.trim(); const description = linkImport.description.value.trim();
  try {
    const items = [];
    for (let index = 0; index < selected.length; index++) {
      setImportStatus(`正在带入图片 ${index + 1}/${selected.length}…`);
      const response = await fetch(`/api/import-image?url=${encodeURIComponent(selected[index])}`); if (!response.ok) throw new Error(`第 ${index + 1} 张图片下载失败`);
      const blob = await response.blob(); const file = new File([blob], `小红书导入-${index + 1}.jpg`, { type: blob.type || 'image/jpeg' });
      items.push({ file, preview: URL.createObjectURL(file), title, description, similarity: Number(ui.similarity.value) });
    }
    workspaceImportItems = items; activeImportIndex = 0; linkImport.dialog.close(); loadImportedItem(0);
  } catch (error) { setImportStatus(error.message || '图片带入失败'); }
  finally { linkImport.queue.classList.remove('loading'); }
});

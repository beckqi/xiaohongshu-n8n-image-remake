const linkImport = {
  open: document.querySelector('#importLink'), dialog: document.querySelector('#importDialog'), close: document.querySelector('#closeImport'), url: document.querySelector('#importUrl'), fetch: document.querySelector('#fetchImport'),
  result: document.querySelector('#importResult'), title: document.querySelector('#importTitle'), description: document.querySelector('#importDescription'), grid: document.querySelector('#importGrid'), queue: document.querySelector('#queueImport'), status: document.querySelector('#importStatus'),
  copySimilarity: document.querySelector('#copySimilarity'), copySimilarityValue: document.querySelector('#copySimilarityValue'), wash: document.querySelector('#washCopy'), washResult: document.querySelector('#washResult'), washedTitle: document.querySelector('#washedTitle'), washedDescription: document.querySelector('#washedDescription'), downloadCopy: document.querySelector('#downloadCopyTxt')
};

let importedImages = [];
let workspaceImportItems = [];
let activeImportIndex = 0;
let applyingImportedItem = false;
let linkProject = null;
let activeCopyTaskId = null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function setImportStatus(message) { linkImport.status.textContent = message; }
function applyCopyResult(copyTaskId, fallbackTitle, fallbackDescription, data) {
  const title = data.title || fallbackTitle; const description = data.description || fallbackDescription;
  window.updateProjectTask?.(copyTaskId, { status: '已完成', copyTitle: title, copyDescription: description });
  if (activeCopyTaskId !== copyTaskId) return;
  linkImport.washedTitle.value = title; linkImport.washedDescription.value = description; linkImport.washResult.hidden = false;
  setImportStatus(`已生成改写文案（目标相似度 ${data.similarity ?? linkImport.copySimilarity.value}%），可继续编辑或下载。`);
}
async function pollCopyTask(taskId, copyTaskId, fallbackTitle, fallbackDescription) {
  const startedAt = Date.now();
  let queryFailures = 0;
  for (let attempt = 0; ; attempt += 1) {
    await delay(attempt ? 1500 : 200);
    try {
      const response = await fetch(`/api/tasks/${taskId}`); const state = await response.json();
      if (response.status === 404) {
        const message = state.error || '后台任务已失效，请重新生成';
        window.updateProjectTask?.(copyTaskId, { status: '生成失败', message });
        if (activeCopyTaskId === copyTaskId) setImportStatus(message);
        return;
      }
      if (!response.ok) throw new Error(state.error || '后台任务查询暂时不可用');
      queryFailures = 0;
      if (state.status === 'processing') {
        if (activeCopyTaskId === copyTaskId) setImportStatus(`${state.message || '后台正在改写文案'}，已等待 ${Math.floor((Date.now() - startedAt) / 1000)} 秒；你可以继续操作其他内容。`);
        continue;
      }
      if (state.status === 'failed') {
        const message = state.error || '文案生成失败';
        window.updateProjectTask?.(copyTaskId, { status: '生成失败', message });
        if (activeCopyTaskId === copyTaskId) setImportStatus(message);
        return;
      }
      if (state.status !== 'completed') continue;
      applyCopyResult(copyTaskId, fallbackTitle, fallbackDescription, state.result || {}); return;
    } catch (error) {
      queryFailures += 1;
      const message = `${error.message || '任务状态查询中断'}，正在自动重试（${queryFailures}）`;
      window.updateProjectTask?.(copyTaskId, { status: '生成中', message });
      if (activeCopyTaskId === copyTaskId) setImportStatus(message);
      await delay(Math.min(10000, queryFailures * 1000));
    }
  }
}
function drawImportedImages() {
  linkImport.grid.innerHTML = importedImages.map((url, index) => `<label class="import-image"><input type="checkbox" value="${index}" checked /><img src="/api/import-image?url=${encodeURIComponent(url)}" alt="导入图片 ${index + 1}" /><span>图片 ${index + 1}</span></label>`).join('');
}

linkImport.open.addEventListener('click', event => { event.preventDefault(); linkImport.dialog.showModal(); });
linkImport.close.addEventListener('click', () => linkImport.dialog.close());
linkImport.copySimilarity.addEventListener('input', () => { linkImport.copySimilarityValue.textContent = `${linkImport.copySimilarity.value}%`; });
linkImport.wash.addEventListener('click', async () => {
  const title = linkImport.title.value.trim(); const description = linkImport.description.value.trim();
  if (!title && !description) return setImportStatus('请先提取或填写标题、文案');
  const project=linkProject||{id:`project-${Date.now()}`,title:title||'链接导入项目'};linkProject=project;const copyTaskId=`copy-${Date.now()}`;activeCopyTaskId=copyTaskId;window.saveProjectTask?.({id:copyTaskId,projectId:project.id,projectTitle:project.title,title,mode:'文案改写',time:new Date().toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit'}),status:'生成中'});
  linkImport.wash.classList.add('loading'); linkImport.wash.textContent = '正在生成改写文案…'; setImportStatus('Mimo 正在按目标相似度改写文案…');
  try {
    const response = await fetch('/api/wash-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description, similarity: Number(linkImport.copySimilarity.value) }) });
    let data = await response.json(); if (!response.ok) throw new Error(data.error || '文案生成失败');
    if (response.status === 202) {
      window.updateProjectTask?.(copyTaskId, { backendTaskId: data.taskId, message: '正在等待 Mimo 返回文案' });
      setImportStatus('文案已提交到后台，完成后会自动显示；你可以继续操作其他内容。');
      pollCopyTask(data.taskId, copyTaskId, title, description);
      return;
    }
    applyCopyResult(copyTaskId, title, description, data);
  } catch (error) { const message=error.message||'文案生成失败';window.updateProjectTask?.(copyTaskId,{status:'生成失败',message});setImportStatus(message); }
  finally { linkImport.wash.classList.remove('loading'); linkImport.wash.textContent = '生成改写文案'; }
});
for (const field of [linkImport.washedTitle, linkImport.washedDescription]) field.addEventListener('input', () => {
  if (activeCopyTaskId) window.updateProjectTask?.(activeCopyTaskId, { copyTitle: linkImport.washedTitle.value.trim(), copyDescription: linkImport.washedDescription.value.trim() });
});
linkImport.downloadCopy.addEventListener('click', () => {
  const title = linkImport.washedTitle.value.trim(); const description = linkImport.washedDescription.value.trim();
  if (!title && !description) return setImportStatus('请先生成改写文案');
  if (activeCopyTaskId) window.updateProjectTask?.(activeCopyTaskId, { status: '已完成', copyTitle: title, copyDescription: description });
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
    importedImages = data.images; linkImport.title.value = data.title || ''; linkImport.description.value = data.description || ''; linkProject={id:`project-${Date.now()}`,title:data.title||`链接导入项目 ${new Date().toLocaleDateString('zh-CN')}`}; linkImport.washResult.hidden = true; drawImportedImages(); linkImport.result.hidden = false; setImportStatus(`已提取 ${importedImages.length} 张图片，勾选后可加入队列。`);
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
  tabs.innerHTML = workspaceImportItems.map((item, index) => { const taskState = item.activeJobs ? `生成中 ×${item.activeJobs}` : item.generationStatus; return `<button class="import-tab ${index===activeImportIndex?'active':''}" data-index="${index}"><img src="${item.preview}" alt="带入图片 ${index+1}" /><span>图片 ${index+1}</span><small>${item.similarity ?? 60}% 相似${taskState ? ` · ${taskState}` : ''}</small></button>`; }).join('');
}

function activeImportItem() { return workspaceImportItems[activeImportIndex]; }
function syncActiveGenerationUI() {
  const running = Number(activeImportItem()?.activeJobs || 0);
  if (!ui.generate.classList.contains('loading')) ui.generate.querySelector('span').textContent = window.getIdleGenerateLabel?.() || '确认文案并生成';
  ui.note.lastElementChild.textContent = running ? `后台有 ${running} 个生成任务；仍可调整参数并再次提交。` : '准备就绪。预计生成 30–90 秒。';
}
window.getActiveImportedItem = activeImportItem;
window.refreshImportedGenerationUI = () => { renderImportTabs(); syncActiveGenerationUI(); };

function loadImportedItem(index) {
  const item = workspaceImportItems[index]; if (!item) return;
  activeImportIndex = index; applyingImportedItem = true; setQueuedImage(item.file); window.setRecognitionMode?.(ui.recognitionMode);
  ui.title.value = item.title; ui.subtitle.value = ''; ui.benefits.value = item.description.slice(0, 180);
  ui.similarity.value = item.similarity ?? 60; updateSimilarityUI(); renderPreview(); renderImportTabs(); syncActiveGenerationUI();
  if (item.resultUrl) { ui.posterBg.src = item.resultUrl; ui.posterBg.hidden = false; ui.aiPlaceholder.hidden = true; }
  else if (item.activeJobs) { ui.aiPlaceholder.hidden = false; ui.aiPlaceholder.querySelector('strong').textContent = `该图片有 ${item.activeJobs} 个后台任务生成中`; }
  applyingImportedItem = false; toast(`已切换到图片 ${index + 1}/${workspaceImportItems.length}，确认文案后再生成`);
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
    const items = []; const projectId = linkProject?.id || `project-${Date.now()}`; const projectTitle = linkProject?.title || title || `链接导入项目 ${new Date().toLocaleDateString('zh-CN')}`;
    for (let index = 0; index < selected.length; index++) {
      setImportStatus(`正在带入图片 ${index + 1}/${selected.length}…`);
      const response = await fetch(`/api/import-image?url=${encodeURIComponent(selected[index])}`); if (!response.ok) throw new Error(`第 ${index + 1} 张图片下载失败`);
      const blob = await response.blob(); const file = new File([blob], `小红书导入-${index + 1}.jpg`, { type: blob.type || 'image/jpeg' });
      items.push({ file, preview: URL.createObjectURL(file), title, description, similarity: Number(ui.similarity.value), projectId, projectTitle });
    }
    workspaceImportItems = items; activeImportIndex = 0; linkImport.dialog.close(); loadImportedItem(0);
  } catch (error) { setImportStatus(error.message || '图片带入失败'); }
  finally { linkImport.queue.classList.remove('loading'); }
});

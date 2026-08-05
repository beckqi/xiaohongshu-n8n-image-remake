const readTasks = () => {
  try { return JSON.parse(localStorage.getItem('poster-remake-recent') || '[]'); } catch { return []; }
};
const writeTasks = next => localStorage.setItem('poster-remake-recent', JSON.stringify(next));
const list = document.querySelector('#projectList');
let activeDialog = null;
let refreshTimer = null;

function groups() {
  const map = new Map();
  readTasks().forEach(task => {
    const id = task.projectId || task.id;
    const project = map.get(id) || { id, title: task.projectTitle || task.title || '未命名项目', items: [] };
    project.items.push(task); map.set(id, project);
  });
  return [...map.values()];
}

function statusText(task) {
  if (task.status === '生成失败') return task.message || '生成失败';
  if (task.status !== '生成中') return task.status || '已完成';
  if (task.progress != null) return `生成中 ${task.progress}%`;
  return task.message || '生成中';
}

function render() {
  list.innerHTML = groups().map(project => `<button class="project-card" data-id="${project.id}"><b>▦</b><span><strong>${project.title}</strong><small>项目任务 · ${project.items.filter(task => task.status === '已完成').length}/${project.items.length} 已完成</small></span><i>→</i></button>`).join('') || '暂无项目';
}

function renderDialog(project) {
  if (!activeDialog) return;
  const taskList = activeDialog.querySelector('#projectTaskList');
  const download = activeDialog.querySelector('#downloadZip');
  taskList.innerHTML = project.items.map(task => `<article class="project-task"><b>${task.mode === '文案改写' ? '✎' : '✦'}</b><span><strong>${task.mode || '图片生成'}</strong><small>${task.title || '处理中任务'}</small></span><em>${statusText(task)}</em></article>`).join('');
  download.disabled = project.items.some(task => task.status === '生成中');
  download.querySelector('span').textContent = download.disabled ? '任务进行中…' : '下载项目包';
}

async function syncRemoteTasks(projectId) {
  const current = readTasks();
  const projectTasks = current.filter(task => (task.projectId || task.id) === projectId && task.status === '生成中');
  if (!projectTasks.length) return;
  let changed = false;
  await Promise.all(projectTasks.map(async task => {
    try {
      if (task.backendTaskId) {
        const response = await fetch(`/api/tasks/${task.backendTaskId}`); const state = await response.json();
        if (response.status === 404) { Object.assign(task, { status: '生成失败', message: '后台任务已失效，请重新生成' }); changed = true; return; }
        if (!response.ok) return;
        if (state.status === 'processing') {
          const next = { ...task, progress: state.progress ?? task.progress, message: state.message || task.message };
          Object.assign(task, next); changed = true; return;
        }
        if (state.status === 'completed') {
          const result = state.result || {}; const images = state.images || [];
          Object.assign(task, { status: '已完成', progress: 100, message: '', copyTitle: result.title || task.copyTitle, copyDescription: result.description || task.copyDescription, url: images[0] || task.url, fileName: images.length ? `已生成 ${images.length} 张` : task.fileName });
          changed = true; return;
        }
        if (state.status === 'failed') { Object.assign(task, { status: '生成失败', message: state.error || '任务失败' }); changed = true; }
      } else if (/^task-(\d+)$/.test(task.id)) {
        const response = await fetch(`/api/history-latest?since=${Number(task.id.slice(5))}`); const data = await response.json();
        if (data.url) { Object.assign(task, { status: '已完成', progress: 100, url: data.url, fileName: '已生成图片' }); changed = true; }
      } else if (task.mode === '文案改写') {
        Object.assign(task, { status: '生成失败', message: '旧任务缺少后台任务 ID，请重新生成' }); changed = true;
      }
    } catch { /* 下一次轮询继续查询 */ }
  }));
  if (changed) { writeTasks(current); render(); }
}

function openProject(id) {
  const project = groups().find(item => item.id === id); if (!project) return;
  const dialog = document.createElement('dialog'); dialog.className = 'project-dialog';
  dialog.innerHTML = `<section><button class="modal-close">×</button><p class="eyebrow">PROJECT TASKS</p><h2>${project.title}</h2><p>图片生成与文案改写</p><div id="projectTaskList" class="project-task-list"></div><button class="generate" id="downloadZip"><span>下载项目包</span><b>↓</b></button></section>`;
  document.body.append(dialog); activeDialog = dialog; dialog.dataset.projectId = id; dialog.showModal(); renderDialog(project);
  const close = () => { clearInterval(refreshTimer); refreshTimer = null; activeDialog = null; dialog.close(); };
  dialog.querySelector('.modal-close').onclick = close;
  dialog.addEventListener('close', () => { clearInterval(refreshTimer); refreshTimer = null; if (activeDialog === dialog) activeDialog = null; dialog.remove(); });
  const button = dialog.querySelector('#downloadZip');
  button.onclick = async () => { const latest = groups().find(item => item.id === id); if (!latest || latest.items.some(task => task.status === '生成中')) return; button.disabled = true; button.querySelector('span').textContent = '正在打包…'; try { await window.downloadProjectArchive(latest.title, latest.items); button.querySelector('span').textContent = '已开始下载'; } catch (error) { button.querySelector('span').textContent = error.message || '打包失败'; } finally { setTimeout(() => { if (activeDialog === dialog) { button.disabled = false; button.querySelector('span').textContent = '下载项目包'; } }, 1800); } };
  const refresh = async () => { await syncRemoteTasks(id); const latest = groups().find(item => item.id === id); if (latest) renderDialog(latest); };
  refresh(); refreshTimer = setInterval(refresh, 1500);
}

list.onclick = event => { const card = event.target.closest('.project-card'); if (card) openProject(card.dataset.id); };
window.addEventListener('storage', event => { if (event.key === 'poster-remake-recent') { render(); if (activeDialog) { const project = groups().find(item => item.id === activeDialog.dataset?.id); if (project) renderDialog(project); } } });
render();

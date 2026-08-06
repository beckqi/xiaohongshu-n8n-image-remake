const ui = {
  file: document.querySelector('#imageFile'), zone: document.querySelector('#uploadZone'), source: document.querySelector('#sourceImage'), empty: document.querySelector('#uploadEmpty'),
  status: document.querySelector('#uploadStatus'), title: document.querySelector('#titleInput'), subtitle: document.querySelector('#subtitleInput'), benefits: document.querySelector('#benefitsInput'),
  posterTitle: document.querySelector('#posterTitle'), posterSubtitle: document.querySelector('#posterSubtitle'), posterBenefits: document.querySelector('#posterBenefits'), posterBg: document.querySelector('#posterBg'), posterCopy: document.querySelector('.poster-copy'), aiPlaceholder: document.querySelector('#aiPreviewPlaceholder'), originalPreview: document.querySelector('#originalPreview'), sourceEmpty: document.querySelector('#sourceEmpty'), frame: document.querySelector('#posterFrame'), ratio: document.querySelector('#imageRatio'), count: document.querySelector('#generationCount'),
  mode: 'layout', modeLabel: document.querySelector('#posterMode'), generate: document.querySelector('#generate'), note: document.querySelector('#generationNote'), toast: document.querySelector('#toast'), similarity: document.querySelector('#similarityInput'), similarityValue: document.querySelector('#similarityValue'), similarityHint: document.querySelector('#similarityHint')
};
const settings = {
  button: document.querySelector('#settings'), dialog: document.querySelector('#settingsDialog'), form: document.querySelector('#settingsForm'), save: document.querySelector('#saveSettings'),
  fields: ['yunwuApiKey', 'yunwuBaseUrl', 'yunwuImageEditPath', 'yunwuImageModel', 'mimoApiKey', 'mimoBaseUrl']
};
const recent = { button: document.querySelector('#recentTasks'), dialog: document.querySelector('#recentDialog'), close: document.querySelector('#closeRecent'), list: document.querySelector('#recentList') };
const recentSession = String(Date.now());
const account = { name: document.querySelector('#accountName'), logout: document.querySelector('#logout') };
fetch('/api/auth/session').then(async response => { if (!response.ok) return location.replace('/login.html'); const data = await response.json(); account.name.textContent = data.user?.username || ''; }).catch(() => location.replace('/login.html'));
account.logout.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/login.html'); });

const modeLabels = {layout:'重新排版', rewrite:'优化文案', rebuild:'重做视觉', free:'AI 自由发挥'};
function renderPreview(){
  ui.posterTitle.textContent = ui.title.value.trim() || '输入主标题';
  ui.posterSubtitle.textContent = ui.subtitle.value.trim() || '输入副标题';
  ui.posterBenefits.innerHTML = ui.benefits.value.split('｜').map(x=>x.trim()).filter(Boolean).slice(0,4).map(x=>`<span>${x}</span>`).join('');
  ui.modeLabel.textContent = modeLabels[ui.mode];
}
function toast(message){ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),2600)}
const ratioMap={source:'3 / 4',portrait:'2 / 3',square:'1 / 1',landscape:'3 / 2'};
function setPreviewRatio(){ui.frame.style.setProperty('--preview-ratio',ratioMap[ui.ratio.value]||'2 / 3');}
function getRecentTasks(){try{const tasks=JSON.parse(localStorage.getItem('poster-remake-recent')||'[]');const normalized=tasks.map(task=>task.url&&task.status==='生成中'?{...task,status:'已完成'}:task);if(JSON.stringify(tasks)!==JSON.stringify(normalized))localStorage.setItem('poster-remake-recent',JSON.stringify(normalized));return normalized}catch{return[]}}
async function recoverCompletedTasks(){const pending=getRecentTasks().filter(task=>task.status==='生成中');await Promise.all(pending.map(async task=>{try{if(task.backendTaskId){const response=await fetch(`/api/tasks/${task.backendTaskId}`);const state=await response.json();if(response.status===404){updateRecentTask(task.id,{status:'生成失败',message:'后台任务已失效，请重新生成'});return;}if(state.status==='completed'){const images=state.images||[];const result=state.result||{};updateRecentTask(task.id,{status:'已完成',progress:100,url:images[0]||task.url,copyTitle:result.title||task.copyTitle,copyDescription:result.description||task.copyDescription,fileName:images.length?`已生成 ${images.length} 张`:task.fileName});}else if(state.status==='failed')updateRecentTask(task.id,{status:'生成失败',message:state.error||'任务失败'});return;}if(/^task-(\d+)$/.test(task.id)){const since=Number(task.id.slice(5));const response=await fetch(`/api/history-latest?since=${since}`);const data=await response.json();if(data.url)updateRecentTask(task.id,{status:'已完成',progress:100,url:data.url,fileName:'已生成图片'});}else if(task.mode==='文案改写')updateRecentTask(task.id,{status:'生成失败',message:'旧任务缺少后台任务 ID，请重新生成'});}catch{}}));}
function saveRecentTask(task){const tasks=[task,...getRecentTasks()].slice(0,12);localStorage.setItem('poster-remake-recent',JSON.stringify(tasks));}
function updateRecentTask(id, changes){const tasks=getRecentTasks().map(task=>task.id===id?{...task,...changes}:task);localStorage.setItem('poster-remake-recent',JSON.stringify(tasks));}
window.saveProjectTask=saveRecentTask;window.updateProjectTask=updateRecentTask;
function renderRecentTasks(){const tasks=getRecentTasks();const groups=new Map();tasks.forEach(task=>{const key=task.projectId||task.id;const group=groups.get(key)||{title:task.projectTitle||task.title,items:[],project:!!task.projectId};group.items.push(task);groups.set(key,group)});recent.list.innerHTML=groups.size?[...groups.entries()].map(([id,group])=>{if(!group.project){const task=group.items[0];return `<article class="recent-item"><div class="recent-icon">✦</div><div><strong>${task.title||'未命名海报'}</strong><small>${task.mode} · ${task.time} · ${task.status||'已完成'}</small></div>${task.status==='生成中'?'<span class="recent-running">生成中</span>':task.url?`<a href="${task.url}" download="${task.fileName}">下载</a>`:'<span class="recent-stale">文件已过期</span>'}</article>`}const done=group.items.filter(task=>task.status==='已完成').length;const running=group.items.some(task=>task.status==='生成中');return `<article class="recent-item project-item"><div class="recent-icon">▦</div><div><strong>${group.title||'链接导入项目'}</strong><small>项目任务 · 已完成 ${done}/${group.items.length} 张</small></div>${running?'<span class="recent-running">生成中</span>':`<button class="ghost project-download" data-project-id="${id}">下载项目包</button>`}</article>`}).join(''):'<div class="recent-empty">还没有生成记录。完成第一张海报后，会显示在这里。</div>';}
function imageAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
function blockMetrics(block){const p=block.box||[];const xs=p.map(x=>x[0]),ys=p.map(x=>x[1]);return {width:Math.max(...xs)-Math.min(...xs),top:Math.min(...ys)}}
async function recognizeCopy(file, options={}){
  ui.status.textContent='正在识别文案';
  try{
    const imageData=await imageAsDataUrl(file);
    const response=await fetch('/api/ocr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageData})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'识别失败');
    const blocks=(data.blocks||[]).filter(x=>x.text&&x.confidence>.45).sort((a,b)=>blockMetrics(a).top-blockMetrics(b).top);
    if(!blocks.length)throw new Error('未识别到清晰文字，请换一张更清晰的图');
    const byWidth=[...blocks].sort((a,b)=>blockMetrics(b).width-blockMetrics(a).width);
    const title=byWidth[0]?.text||blocks[0].text;
    const subtitle=byWidth.find(x=>x.text!==title)?.text||'';
    const benefits=blocks.map(x=>x.text).filter(x=>x!==title&&x!==subtitle).join('｜');
    if(options.subtitleOnly){ui.subtitle.value=subtitle;renderPreview();toast(subtitle?'已自动识别副标题':'未识别到副标题');return subtitle;}
    ui.title.value=title;ui.subtitle.value=subtitle;ui.benefits.value=benefits;renderPreview();
    ui.status.textContent=`已识别 ${blocks.length} 段文案`;toast('文案已识别并填入，可直接修改');
  }catch(error){ui.status.textContent='识别失败';toast(error.message||'文案识别失败');return '';}
}
function handleFile(file){
  if(!file) return;
  if(file.size>8*1024*1024){toast('图片请控制在 8MB 以内');return;}
  const url=URL.createObjectURL(file);ui.source.src=url;ui.source.hidden=false;ui.empty.hidden=true;ui.status.textContent='已上传';ui.originalPreview.src=url;ui.originalPreview.hidden=false;ui.sourceEmpty.hidden=true;ui.posterBg.hidden=true;ui.posterCopy.hidden=true;ui.modeLabel.hidden=true;ui.aiPlaceholder.hidden=false;setPreviewRatio();toast('参考图已加载，正在识别文案');recognizeCopy(file);
}
ui.file.addEventListener('change',e=>handleFile(e.target.files[0]));
['dragenter','dragover'].forEach(event=>ui.zone.addEventListener(event,e=>{e.preventDefault();ui.zone.classList.add('drag')}));
['dragleave','drop'].forEach(event=>ui.zone.addEventListener(event,e=>{e.preventDefault();ui.zone.classList.remove('drag')}));
ui.zone.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
document.querySelector('#modes').addEventListener('click',e=>{const button=e.target.closest('.mode-card');if(!button)return;ui.mode=button.dataset.mode;document.querySelectorAll('.mode-card').forEach(x=>x.classList.toggle('selected',x===button));renderPreview();});
[ui.title,ui.subtitle,ui.benefits].forEach(input=>input.addEventListener('input',renderPreview));
function updateSimilarityUI(){const value=Number(ui.similarity.value);ui.similarityValue.textContent=`${value}%`;ui.similarityHint.textContent=value>=90?'轻微微调：尽量保留原图构图、主体与色调，仅改局部细节':value>=75?'贴近原图主题与氛围，但允许调整构图':'数值越低，AI 改变场景、构图与视觉语言的幅度越大';}
ui.similarity.addEventListener('input',()=>{updateSimilarityUI();window.syncActiveImportedSimilarity?.(Number(ui.similarity.value));});
ui.ratio.addEventListener('change',setPreviewRatio);
document.querySelector('#demoOcr').addEventListener('click',()=>{const file=ui.file.files[0];if(!file){toast('请先上传图片再识别');return;}recognizeCopy(file);});
document.querySelector('#reset').addEventListener('click',()=>{ui.file.value='';ui.source.hidden=true;ui.empty.hidden=false;ui.originalPreview.hidden=true;ui.sourceEmpty.hidden=false;ui.posterBg.hidden=true;ui.posterCopy.hidden=true;ui.modeLabel.hidden=true;ui.aiPlaceholder.hidden=false;ui.status.textContent='等待上传';ui.mode='layout';document.querySelectorAll('.mode-card').forEach((x,i)=>x.classList.toggle('selected',i===0));renderPreview();toast('已恢复初始状态');});
settings.button.addEventListener('click', async () => {
  settings.dialog.showModal();
  try {
    const response = await fetch('/api/settings');
    const data = await response.json();
    settings.fields.forEach(field => {
      const element = document.querySelector(`#${field}`);
      if (data[field]) {
        if (field.endsWith('ApiKey')) element.placeholder = data[field];
        else element.value = data[field];
      }
    });
  } catch { toast('暂时无法读取本机设置'); }
});
settings.form.addEventListener('submit', async event => {
  event.preventDefault();
  settings.save.classList.add('loading');
  try {
    const payload = Object.fromEntries(settings.fields.map(field => [field, document.querySelector(`#${field}`).value]));
    const response = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '设置保存失败');
    settings.dialog.close();
    toast('已保存。重启 n8n 后，新密钥就会生效。');
  } catch (error) { toast(error.message || '设置保存失败'); }
  finally { settings.save.classList.remove('loading'); }
});
let recentSyncTimer=null;
if (recent.button) recent.button.addEventListener('click', event => { event.preventDefault(); renderRecentTasks(); recent.dialog.showModal(); clearInterval(recentSyncTimer); recentSyncTimer=setInterval(async()=>{await recoverCompletedTasks();renderRecentTasks();},1500); });
recent.close.addEventListener('click', () => { clearInterval(recentSyncTimer); recentSyncTimer=null; recent.dialog.close(); });
recent.dialog.addEventListener('close', () => { clearInterval(recentSyncTimer); recentSyncTimer=null; });
recent.list.addEventListener('click',async event=>{const button=event.target.closest('.project-download');if(!button)return;button.disabled=true;button.textContent='正在打包…';try{const tasks=getRecentTasks().filter(task=>task.projectId===button.dataset.projectId);await window.downloadProjectArchive(tasks[0]?.projectTitle,tasks);button.textContent='已开始下载'}catch(error){button.textContent=error.message||'打包失败'}finally{setTimeout(()=>{button.disabled=false;button.textContent='下载项目包'},1800)}});
async function waitForGenerationTask(taskId, onWaiting=()=>{}){
  let queryFailures=0;
  while(true){
    try{
      const response=await fetch(`/api/tasks/${taskId}`);
      const state=await response.json();
      if(response.status===404)throw new Error(state.error||'后台任务已失效，请重新生成');
      if(!response.ok){queryFailures+=1;onWaiting(`任务状态查询暂时不可用，正在自动重试（${queryFailures}）`);await new Promise(resolve=>setTimeout(resolve,Math.min(10000,queryFailures*1000)));continue;}
      queryFailures=0;
      if(state.status==='processing'){onWaiting(state.message||'灵客正在生成');await new Promise(resolve=>setTimeout(resolve,1500));continue;}
      if(state.status==='completed'||state.status==='failed')return state;
      onWaiting('后台仍在处理，正在继续获取状态');await new Promise(resolve=>setTimeout(resolve,1500));
    }catch(error){
      if(error.message?.includes('任务已失效'))throw error;
      queryFailures+=1;onWaiting(`连接暂时中断，正在自动重试（${queryFailures}）`);await new Promise(resolve=>setTimeout(resolve,Math.min(10000,queryFailures*1000)));
    }
  }
}
ui.generate.addEventListener('click',async()=>{
  const file=ui.file.files[0];
  if(!file){toast('请先上传一张参考图片');return;}
  const importedItem=window.getActiveImportedItem?.();
  if(importedItem?.generationStatus==='生成中'){toast('这张图片已在生成队列中，可切换其他图片继续提交');return;}
  const taskId=`task-${Date.now()}`;saveRecentTask({id:taskId,title:ui.title.value.trim(),mode:modeLabels[ui.mode],time:new Date().toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit'}),status:'生成中',session:recentSession,projectId:importedItem?.projectId,projectTitle:importedItem?.projectTitle});
  if(importedItem){importedItem.generationStatus='生成中';window.refreshImportedGenerationUI?.();}else{ui.generate.classList.add('loading');ui.generate.querySelector('span').textContent='AI 正在生成…';ui.note.lastElementChild.textContent='灵境正在用 GPT Image 2 重构画面，请稍候。';}
  ui.aiPlaceholder.hidden=false;ui.aiPlaceholder.querySelector('strong').textContent='AI 正在生成真实成图';
  const isCurrentItem=()=>!importedItem||window.getActiveImportedItem?.()===importedItem;
  const showResult=url=>{if(!isCurrentItem())return;ui.posterBg.src=url;ui.posterBg.hidden=false;ui.posterCopy.hidden=true;ui.modeLabel.hidden=true;ui.aiPlaceholder.hidden=true;};
  try{
    if(ui.subtitle.value.trim()==='识别'){await recognizeCopy(file,{subtitleOnly:true});}
    const imageData=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
    const response=await fetch('/api/rebuild',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageData,mode:ui.mode,similarity:Number(ui.similarity.value),imageRatio:ui.ratio.value,generationCount:Number(ui.count.value),copy:{title:ui.title.value,subtitle:ui.subtitle.value,benefits:ui.benefits.value.split('｜').map(x=>x.trim()).filter(Boolean),eyebrow:'小学同步学习资料'},layout:'bold'})});
    if(!response.ok) throw new Error((await response.json()).error || '后台暂未就绪');
    if(response.status===202){const job=await response.json();updateRecentTask(taskId,{backendTaskId:job.taskId,message:'正在等待灵客返回图片'});const state=await waitForGenerationTask(job.taskId,message=>updateRecentTask(taskId,{status:'生成中',message}));if(state.status==='failed')throw new Error(state.error||'生成失败');const images=state.images||[];if(!images.length)throw new Error('生成未返回图片');if(importedItem){importedItem.generationStatus='已完成';importedItem.resultUrl=images[0];}showResult(images[0]);updateRecentTask(taskId,{status:'已完成',progress:100,fileName:`已生成 ${images.length} 张`,url:images[0],message:''});toast(`已生成 ${images.length} 张海报`);return;}
    const contentType=response.headers.get('content-type')||'';if(contentType.includes('application/json')){const data=await response.json();const images=data.images||[];if(!images.length)throw new Error('灵境未返回图片');images.forEach((image,index)=>{const download=document.createElement('a');download.href=image;download.download=`海报重构-${Date.now()}-${index+1}.png`;download.click();});if(importedItem){importedItem.generationStatus='已完成';importedItem.resultUrl=images[0];}showResult(images[0]);updateRecentTask(taskId,{status:'已完成',fileName:`已生成 ${images.length} 张`,url:images[0]});toast(`已生成 ${images.length} 张海报，正在下载`);}else{const blob=await response.blob();const url=URL.createObjectURL(blob);const fileName=`海报重构-${new Date().toISOString().slice(0,10)}.png`;const download=document.createElement('a');download.href=url;download.download=fileName;download.click();if(importedItem){importedItem.generationStatus='已完成';importedItem.resultUrl=url;}showResult(url);updateRecentTask(taskId,{status:'已完成',fileName,url});toast('新海报已生成，正在下载 PNG 文件');}
  }catch(error){if(importedItem)importedItem.generationStatus='生成失败';updateRecentTask(taskId,{status:'生成失败'});toast(error.message || 'n8n 尚未完成连接配置');}
  finally{if(importedItem){window.refreshImportedGenerationUI?.();}else{ui.generate.classList.remove('loading');ui.generate.querySelector('span').textContent='生成新海报';ui.note.lastElementChild.textContent='准备就绪。预计生成 30–90 秒。';}}
});
setPreviewRatio();renderPreview();recoverCompletedTasks();

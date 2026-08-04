const canvas = document.querySelector('#poster');
const ctx = canvas.getContext('2d');
const title = document.querySelector('#title');
const body = document.querySelector('#body');
const tags = document.querySelector('#tags');
const download = document.querySelector('#download');
let style = 'paper';

function font(weight, size, family = 'Noto Sans SC') { ctx.font = `${weight} ${size}px "${family}"`; }
function wrap(text, x, y, max, lh) { let line='', yy=y; for(const c of text){ if(ctx.measureText(line+c).width>max && line){ctx.fillText(line,x,yy);line=c;yy+=lh}else line+=c; } if(line)ctx.fillText(line,x,yy); return yy; }
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function draw() {
  const w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h);
  const values={ title:title.value.trim()||'输入你的标题', body:body.value.trim(), tags:tags.value.split('·').map(x=>x.trim()).filter(Boolean) };
  if(style==='paper') paper(values,w,h); if(style==='night') night(values,w,h); if(style==='pop') pop(values,w,h);
  download.disabled=false;
}
function paper(v,w,h){
  ctx.fillStyle='#f6e8cb';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e2cc9e';for(let i=0;i<150;i++)ctx.fillRect(Math.random()*w,Math.random()*h,2,2);
  ctx.fillStyle='#ff645d';ctx.beginPath();ctx.arc(1010,190,190,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f8b85b';ctx.beginPath();ctx.arc(190,1300,230,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(925,610);ctx.rotate(-.15);ctx.fillStyle='#fffaf0';rounded(-295,-155,590,310,18);ctx.fillStyle='#20201d';font(800,40);ctx.fillText('TODAY',-210,-50);font(400,26);ctx.fillText('make it happen',-210,15);ctx.restore();
  ctx.fillStyle='#20201d';font(900,104);const bottom=wrap(v.title,100,430,930,128);ctx.fillStyle='#5e5547';font(500,42);wrap(v.body,104,bottom+95,890,62); tagsLine(v.tags,105,1330,'#20201d','#fffaf0'); footer('# 灵感重构  /  你的原创视觉稿','#20201d');
}
function night(v,w,h){
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#17162f');g.addColorStop(1,'#534087');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='#e6d7ff';for(let i=0;i<50;i++){ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,Math.random()*5+1,0,7);ctx.fill()}
  ctx.strokeStyle='#b99cff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(875,490,290,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#f1eaff';font(700,42,'Playfair Display');ctx.fillText('GOOD IDEAS',105,250);font(900,112);wrap(v.title,98,490,970,132);ctx.fillStyle='#dbcef8';font(500,40);wrap(v.body,103,960,870,60);tagsLine(v.tags,105,1260,'#f1eaff','#312759');footer('INSPIRATION / REBUILT','#e6d7ff');
}
function pop(v,w,h){
  ctx.fillStyle='#fff5ed';ctx.fillRect(0,0,w,h);ctx.fillStyle='#ff6961';rounded(60,70,1120,1410,42);ctx.fillStyle='#ffdf63';ctx.beginPath();ctx.arc(1000,290,170,0,7);ctx.fill();ctx.fillStyle='#2351bb';ctx.beginPath();ctx.arc(190,1240,150,0,7);ctx.fill();
  ctx.fillStyle='#fff8ef';font(900,106);wrap(v.title,105,405,910,128);ctx.fillStyle='#252229';font(700,41);rounded(100,825,850,170,20);ctx.fillStyle='#fff8ef';font(500,39);wrap(v.body,135,890,790,55);tagsLine(v.tags,103,1120,'#252229','#ffdf63');ctx.fillStyle='#fff8ef';font(900,31);ctx.fillText('NEW LOOK · SAME MESSAGE',100,1388);
}
function tagsLine(items,x,y,ink,paper){let xx=x;font(700,27);for(const tag of items.slice(0,3)){const t='# '+tag;const width=ctx.measureText(t).width+48;ctx.fillStyle=paper;rounded(xx,y-38,width,62,31);ctx.fillStyle=ink;ctx.fillText(t,xx+24,y+3);xx+=width+18}}
function footer(text,color){ctx.fillStyle=color;ctx.globalAlpha=.7;font(500,25);ctx.fillText(text,104,1540);ctx.globalAlpha=1}
document.querySelector('#fileInput').addEventListener('change', e=>{const file=e.target.files[0];if(!file)return;const preview=document.querySelector('#sourcePreview');preview.src=URL.createObjectURL(file);preview.classList.remove('hidden');});
document.querySelector('#styles').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;style=button.dataset.style;document.querySelectorAll('.style').forEach(x=>x.classList.toggle('active',x===button));draw();});
document.querySelector('#generate').addEventListener('click',draw);
download.addEventListener('click',()=>{const a=document.createElement('a');a.download='xiaohongshu-original-poster.png';a.href=canvas.toDataURL('image/png');a.click();});
draw();

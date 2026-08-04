const form = document.querySelector('#job-form');
const image = document.querySelector('#image');
let imageData = '';
image.addEventListener('change', () => {
  const file = image.files[0];
  if (!file) return (imageData = '');
  const reader = new FileReader();
  reader.onload = () => { imageData = reader.result; };
  reader.readAsDataURL(file);
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.productImage = imageData;
  const response = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) return alert(result.error || '生成失败');
  document.querySelector('#result').hidden = false;
  document.querySelector('#endpoint').value = location.origin;
  document.querySelector('#job-id').value = result.id;
  document.querySelector('#scene').textContent = JSON.stringify(result.scene, null, 2);
});
document.querySelector('#copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(`${location.origin}\n${document.querySelector('#job-id').value}`);
  document.querySelector('#copy').textContent = '已复制';
});

mg.showUI(__html__, { width: 420, height: 520 });

const rgb = (hex) => {
  const clean = (hex || '#000000').replace('#', '');
  return { r: parseInt(clean.slice(0, 2), 16) / 255, g: parseInt(clean.slice(2, 4), 16) / 255, b: parseInt(clean.slice(4, 6), 16) / 255, a: 1 };
};

async function addText(frame, item) {
  const node = mg.createText();
  const fontName = node.textStyles[0].textStyle.fontName;
  await mg.loadFontAsync(fontName);
  node.characters = item.content;
  node.setRangeFontSize(0, node.characters.length, item.fontSize || 32);
  node.name = item.name;
  node.x = item.x; node.y = item.y;
  node.fills = [{ type: 'SOLID', color: rgb(item.color), alpha: 1, isVisible: true, blendMode: 'NORMAL' }];
  frame.appendChild(node);
}

async function addImage(frame, item) {
  const node = mg.createRectangle();
  node.name = item.name;
  node.x = item.x; node.y = item.y; node.resize(item.width, item.height);
  const image = await mg.createImage(new Uint8Array(item.bytes));
  node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageRef: image.href }];
  frame.appendChild(node);
}

function addRect(frame, item) {
  const node = mg.createRectangle();
  node.name = item.name;
  node.x = item.x; node.y = item.y; node.resize(item.width, item.height);
  node.fills = [{ type: 'SOLID', color: rgb(item.color), alpha: 1, isVisible: true, blendMode: 'NORMAL' }];
  frame.appendChild(node);
}

mg.ui.onmessage = async (message) => {
  if (message.type !== 'import-scene') return;
  try {
    const scene = message.scene;
    const frame = mg.createFrame();
    frame.name = scene.name || 'AI 小红书设计';
    frame.resize(scene.canvas.width, scene.canvas.height);
    frame.x = mg.viewport.center.x - frame.width / 2;
    frame.y = mg.viewport.center.y - frame.height / 2;
    mg.document.currentPage.appendChild(frame);
    for (const item of scene.elements) {
      if (item.type === 'text') await addText(frame, item);
      if (item.type === 'image') await addImage(frame, item);
      if (item.type === 'rect') addRect(frame, item);
    }
    mg.document.currentPage.selection = [frame];
    mg.viewport.scrollAndZoomIntoView([frame]);
    mg.commitUndo();
    mg.ui.postMessage({ type: 'success' });
  } catch (error) { mg.ui.postMessage({ type: 'error', message: error.message || '导入失败' }); }
};

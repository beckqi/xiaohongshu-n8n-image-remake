# 灵感重构 MVP

一个面向小红书内容的原创视觉重排版原型：用户上传有使用权的参考图片，确认文案，选择一种新视觉后生成 1242×1660 的 PNG。

## 运行

在本目录执行：

```powershell
npm start
```

打开 `http://localhost:4173/rebuild.html`。

## 接入 n8n

先导入 `n8n-workflow-template.json`，将生产 Webhook URL 设置为环境变量 `N8N_WEBHOOK_URL` 后再运行 `npm start`。网页会向 `/api/rebuild` 发送原图 Base64、用户确认的文字和模式 `preserve-copy-new-visual`。

n8n 需要返回以下 JSON：

```json
{ "backgroundUrl": "https://你的存储地址/新背景.png", "copy": { "headline": "用户确认后的原文" } }
```

在工作流中依次加入：

1. OCR / 视觉模型：提取标题、正文、标签和主题；
2. 内容审核：拒绝去水印、模仿特定作者或无授权素材；
3. 图片生成：仅生成**不带文字**的新背景、插画与装饰；
4. 渲染服务：传入已确认文案与模板 ID，返回最终图片 URL；
5. 回调或轮询接口：将结果状态回传给网页。

文字务必由渲染服务使用字体排版，不建议让图片模型生成中文文字。

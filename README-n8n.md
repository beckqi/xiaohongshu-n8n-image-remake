# n8n AI 海报重构

## 启动

1. 将 `.env.example` 复制为 `.env`，填写云雾与 Mimo 密钥及云雾实际接口路径。
2. 运行 `docker compose up -d --build`。
3. 打开 `http://localhost:5678`，导入 `n8n-workflow-img2.json`。
4. 在 Webhook 节点中启用生产地址。

## 调用约定

上传请求为 `multipart/form-data`：

- `data`：图片二进制；
- `mode`：`layout`、`rewrite` 或 `rebuild`；
- `copy`：可选 JSON，包含 `title`、`subtitle`、`benefits`、`eyebrow`；
- `layout`：`clean`、`bold` 或 `notebook`。

工作流最后直接返回 PNG 下载。

## 三个模式

- `layout`：原文案不变，`img-2` 参考图生图为无文字底图，再精确排版。
- `rewrite`：Mimo 优化文案，`img-2` 参考图生图为无文字底图，再精确排版。
- `rebuild`：原文案不变，`img-2` 生成全新视觉底图，再精确排版。

图片模型不能可靠地输出中文，因此所有文字都由 `image-worker` 使用字体渲染。

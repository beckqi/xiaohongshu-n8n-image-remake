# AI MasterGo Studio

独立于现有“小红书洗图”产品的新原型。它把 AI 的内容组织为可编辑画布数据，再由 MasterGo 插件创建真实的文字、图片与色块图层。

## 运行

在本目录运行 `npm start`，打开 `http://localhost:4178` 创建任务。

## 导入 MasterGo

1. 在网页中创建任务，复制服务地址和任务 ID。
2. 在 MasterGo 客户端选择“插件 → 开发者模式 → 创建/添加插件”。
3. 选择 `mastergo-plugin/manifest.json`。
4. 在一个有编辑权限的设计文件中运行“AI MasterGo Studio 导入器”，粘贴两项信息后导入。

导入后，标题、卖点、行动文案和商品图均为独立图层。图片是普通图片填充，用户可在 MasterGo 中自行替换；文字保留为可编辑文本层。

## 下一步接入 AI / n8n

目前 `POST /api/jobs` 用本地规则生成演示场景。n8n 未来只需要调用此接口，传入 `title`、`subtitle`、`sellingPoints` 和 `productImage`；然后把视觉模型和文案模型的输出填入这些字段即可。图像模型应只生成无文字背景或装饰素材，文字必须由插件创建，才能保持可编辑。

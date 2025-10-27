# pdf-translate.com 开发文档

## 一、概述

### 1.1 产品目标

pdf-translate.com 旨在为全球用户提供高效、可扩展的 PDF 文档翻译服务。系统需要支持文本型 PDF、扫描件 PDF 以及包含多语言与行业术语的资料，确保在保持原始版式与色彩的同时，输出精准翻译结果。平台将采用多引擎翻译策略与可配置术语表，为不同行业提供专业化服务。

### 1.2 关键需求

- 支持任意语言互译，按需路由 Google、DeepL、OpenAI 等引擎。
- 分屏展示原文与译文，并提供同步滚动预览体验。
- 输出高保真的译文 PDF，支持原样下载。
- 针对扫描件 PDF 自动 OCR，复原文本、排版与公式。
- 保留原文布局与色彩，处理多语言长度差异导致的排版回流。
- 完整托管在 Cloudflare Workers 上，具备弹性扩展能力。
- 提供行业术语配置，保证术语一致性和翻译风格。
- 保留公式、图片、图表及矢量元素。

## 二、系统架构

### 2.1 技术栈

**前端：**
- Next.js 14（App Router）+ React 18：`src/app` 目录下已包含营销页、鉴权、仪表盘等模板，支持 Server Components 与 RSC。
- Tailwind CSS：快速构建响应式 UI，结合 `@shadcn/ui` 组件库与 Radix UI。
- pdf.js：用于原文与译文预览渲染，计划集成在 `src/components/pdf` 自定义组件中。

**后端：**
- Cloudflare Workers + OpenNext：通过 `wrangler.jsonc` 与 `.open-next/worker.js` 打包，无服务器部署。
- Cloudflare D1：关系型数据库，绑定名 `DB`（业务数据）与 `NEXT_TAG_CACHE_D1`（标签缓存）。
- Cloudflare Durable Objects：`DOQueueHandler` 负责任务并发控制与状态机锁。
- Cloudflare Queues：处理翻译流水线异步任务。
- Cloudflare KV：`NEXT_INC_CACHE_KV` 存放 Next.js ISR 缓存元数据。
- Cloudflare R2：存储原始 PDF、OCR 中间件、译文结果与底图切片。
- Node.js 兼容层：启用 `nodejs_compat` 以便使用 `pdf-lib`、`@pdf-lib/standard-fonts`、`canvas` 等 Node 模块。

**外部服务：**
- 翻译：DeepL API、Google Cloud Translation、OpenAI GPT-4.1/3.5（可根据行业与语言自动挑选）。
- OCR：Google Vision API、Azure OCR、Mathpix（用于公式与手写识别）。
- 辅助：Stripe/Braintree（若启用计费）、SendGrid/Postmark（邮件通知）。

### 2.2 部署架构

所有应用逻辑部署于 Cloudflare Workers。静态资源由 Cloudflare Assets 托管，动态处理交由 Worker 脚本完成：

1. 前端请求通过 Cloudflare CDN → Workers（含 Next.js SSR/ISR）处理。
2. 上传文件经 Workers 流式写入 R2，并同步写入 D1 任务表。
3. Durable Objects 负责任务去重、并发锁与状态推进。
4. 队列消费者以 Worker Cron/Queue 触发，逐阶段执行 PREPARE → PUBLISH。
5. 译文输出与中间态推送至 R2，最终生成签名 URL 回传给前端。

## 三、任务流程

> 参考实现：队列消费者建议放置在 `src/server/workers`（新建目录），并通过 `wrangler.toml`/`wrangler.jsonc` 的 queue 绑定启用。

### 3.1 用户上传与任务创建（CREATE）
- 前端组件：`src/app/(dashboard)/translations/new/page.tsx`（待新增）。
- 上传流程：使用 `<input type="file" />` + Dropzone，生成 `FormData` 通过 `/api/upload`（Server Action 或 Route Handler）提交。
- Worker 收到文件后将流写入 R2（桶名建议 `pdf-translate-source`），返回文件 key。
- 任务信息写入 `pdf_translate_com_core_jobs`（见下文数据结构），状态初始为 `queued`。
- 通过 Cloudflare Queues 推送任务 ID，等待流水线消费。

### 3.2 任务流水线

1. **PREPARE：页信息与底图**
   - 使用 `pdf.js`（运行于 Worker 使用 `pdf-lib` + `@canvas` 替代）解析页尺寸。
   - 将每页渲染为 PNG（云端 Canvas 或 Cloudflare Browser Rendering），存于 R2 `pdf-translate-previews`。
   - 将页尺寸、DPI、背景图 URL 写入 `pdf_translate_com_core_pages`。

2. **OCR（可选）**
   - 针对扫描件或嵌入图片文字，调用 Google Vision/Azure/Mathpix。
   - 输出的文本块（含坐标）写入 R2 `pdf-translate-ocr` 并同步 `pdf_translate_com_core_ocr_results`。
   - OCR 触发条件：原文无文本层、或用户强制启用。

3. **SEGMENT：段落切分与布局结构**
   - 依据 `pdf.js`/OCR 坐标拆分段落、行、词，生成布局 JSON（包含字体、字号、行距等）。
   - 存储：`pdf_translate_com_core_segments` 与 R2 `pdf-translate-layouts`（备份）。
   - 需要考虑多栏与表格，可利用 `src/lib/pdf-layout.ts`（待实现）封装算法。

4. **TRANSLATE：翻译与术语匹配**
   - 根据 `pdf_translate_com_cfg_glossaries` 载入术语。
   - 任务执行器优先选择用户指定引擎，否则根据语言对/字数自动路由（例如：小语种默认 GPT，多语 DeepL）。
   - 翻译结果写入 `pdf_translate_com_core_segments_translations`，同时保留原文 → 译文映射。
   - 对于 GPT，需要构造系统提示包含行业要求、术语对照、篇章语气。

5. **LAYOUT：HTML/SVG 复刻与排版**
   - 基于布局 JSON 生成页面 HTML/SVG，覆盖译文文本。
   - 若译文长度超出容器，应用自动缩放或换行策略。必要时进行分栏调整。
   - 预览静态文件存入 R2 `pdf-translate-render-cache`，供分屏预览使用。

6. **RENDER：生成译文 PDF**
   - 调用 Cloudflare Browser Rendering Service，将 HTML/SVG 渲染为 PDF。
   - 使用 `pdf-lib` 合并底图与文本层，保证图层、透明度与字体正确。
   - 成品 PDF 写入 R2 `pdf-translate-output`，路径与签名 URL 保存到 `pdf_translate_com_core_jobs`。

7. **PUBLISH：任务完成**
   - 更新任务状态 `published`，记录完成时间、文件大小、消耗的额度。
   - 触发通知（邮件或 Webhook），并将下载链接返回给前端。

### 3.3 状态管理

Durable Object `DOQueueHandler` 负责：
- 维护任务锁，防止多消费者重复执行。
- 记录阶段进度，支持失败重试与幂等操作。
- 汇总状态写回 D1，对接前端实时轮询或 SSE 推送。

## 四、数据结构与命名规范

### 4.1 表前缀策略

所有 D1 表统一添加 `pdf_translate_com_` 前缀，并按业务域拆分：
- `core_`：主业务对象（用户、团队、任务、页面、段落等）。
- `cfg_`：配置/术语/行业相关表。
- `fin_`：计费与额度记录。
- `ops_`：运维、审计、速率限制等。

### 4.2 主要表清单（节选）

| 表名 | 说明 |
| --- | --- |
| `pdf_translate_com_core_users` | 用户主表，包含鉴权、额度、角色信息。 |
| `pdf_translate_com_core_passkey_credentials` | Passkey 凭据。 |
| `pdf_translate_com_fin_credit_transactions` | 额度流水。 |
| `pdf_translate_com_core_purchased_items` | 购买记录（若启用增值组件/套餐）。 |
| `pdf_translate_com_core_teams` | 团队信息与多租户支持。 |
| `pdf_translate_com_core_team_memberships` | 团队成员、角色绑定。 |
| `pdf_translate_com_core_team_roles` | 自定义角色与权限集合。 |
| `pdf_translate_com_core_team_invitations` | 团队邀请。 |
| `pdf_translate_com_ops_guest_quota` | 游客访问/额度控制。 |
| `pdf_translate_com_fin_stripe_customer_map` | Stripe 与用户映射。 |
| `pdf_translate_com_core_tags` / `pdf_translate_com_core_revalidations` | Next.js 标签缓存。 |
| `pdf_translate_com_core_jobs` | 翻译任务主表（需新增，字段包括 status、sourceFileKey、targetLang 等）。 |
| `pdf_translate_com_core_pages` | 任务页面尺寸与底图。 |
| `pdf_translate_com_core_segments` | 页面段落结构。 |
| `pdf_translate_com_core_segments_translations` | 段落译文与元数据。 |
| `pdf_translate_com_cfg_glossaries` | 行业术语配置。 |
| `pdf_translate_com_ops_audit_logs` | 审计日志。 |

> 注：新增业务表的模式与已有 `schema.ts` 保持一致，使用 `sqliteTable` 定义并置于 `src/db/schema.ts` 中。

### 4.3 索引命名

索引统一以 `idx_pdf_translate_com_<domain>_<table>_<column>` 命名，唯一索引使用 `uniq_` 前缀，方便排查与迁移。

## 五、前端设计与实现

### 5.1 任务创建页
- 参考 `src/app/(dashboard)/templates/create` 现有 SaaS 模板布局，新建翻译任务表单。
- 表单字段：目标语言、行业类别、引擎偏好、是否启用 OCR、备注等。
- 使用 React Hook Form + Zod 校验（已有工具在 `src/schemas`）。
- 上传组件：复用 `src/components/ui/file-uploader`（若无则新增，并在 `src/components` 下维护）。

### 5.2 任务详情与分屏预览
- 路由：`/dashboard/translations/[jobId]`。
- 左侧使用 pdf.js 渲染源文档（R2 签名 URL）。
- 右侧渲染译文 HTML/SVG，支持同步滚动、段落高亮。
- 提供下载按钮，调用 `/api/jobs/[jobId]/download` 返回签名 URL。
- 若译文生成中，展示实时进度（SWR 轮询 `api/jobs/[jobId]/status` 或使用 SSE）。

### 5.3 额度与计费
- 仪表盘顶部展示剩余额度、最近消费（取自 `pdf_translate_com_fin_credit_transactions`）。
- 若集成 Stripe，UI 可沿用模板内的 `Billing` 页面，调整文案与套餐配置。

## 六、运维与监控

- 审计日志：所有敏感操作写入 `pdf_translate_com_ops_audit_logs`（操作人、动作、参数、时间）。
- 日志采集：Cloudflare Logs + Workers Analytics Engine（可选）记录请求、队列消费情况。
- 告警：针对任务失败次数、OCR/翻译失败率设置告警（可用 Workers Triggers + Email/SMS Webhook）。
- API 限流：对外接口使用 `pdf_translate_com_ops_guest_quota` 控制匿名访问，登录用户可基于额度限制。

## 七、隐私与合规

- 文件访问：统一通过 R2 签名 URL 控制时效，默认 10 分钟内有效。
- 数据留存策略：允许企业用户配置自动清除策略（如 30 天删除源文档/译文）。
- 第三方服务：在隐私政策中明确列出翻译/OCR 供应商，支持用户关闭特定供应商。
- 数据隔离：多租户隔离通过团队 ID 与任务表联动，避免数据泄露。

## 八、开发阶段与任务拆分

1. **任务 A：文件上传与任务创建**
   - 新建上传 API、R2 写入、任务表记录。
2. **任务 B：队列消费者与流水线阶段实现**
   - 搭建执行框架，逐步实现 PREPARE → PUBLISH。
3. **任务 C：前端分屏预览与下载**
   - 实现仪表盘 UI、状态轮询、下载功能。
4. **任务 D：术语表与引擎路由**
   - 管理术语配置、支持 Admin 导入/导出。
5. **任务 E：OCR 支持**
   - 集成 Vision/Azure/Mathpix，完善异常处理与回退策略。
6. **任务 F：排版与色彩精确还原**
   - 实现文本框尺寸调节、字体资产管理、表格复刻。

任务拆分需遵循“在不改变模板既有功能基础上扩展”原则，所有新代码应通过模块化方式接入，避免破坏模板已有的 SaaS 功能（账户、团队、计费等）。

## 九、测试与验收标准

**功能测试：**
- 上传多类型 PDF（文本/扫描/混合），验证流程成功率。
- 翻译质量：覆盖多语言（中、英、日、德等）与行业文档（法律、医学、金融）。
- 版式保真：重点关注表格、公式、图像重排，验证分屏与导出一致性。
- 术语表：验证术语优先级与导入导出。

**性能测试：**
- 大文件（≥1000 页）分段处理耗时统计，评估 R2 存储与队列吞吐。
- 并发：模拟高并发上传（≥100 并发），验证 Durable Object 锁与队列稳定性。

**安全测试：**
- 访问控制：验证 R2 签名 URL 与下载接口鉴权。
- 数据隐私：确认日志与缓存不泄露敏感信息，OCR/翻译调用使用必要加密。

## 十、里程碑与部署

1. **MVP（文本型 PDF）**
   - 实现上传、翻译、预览、下载主流程；术语表支持基础版。
2. **扫描件支持**
   - 集成 OCR，覆盖常见扫描场景。
3. **高级排版与行业术语**
   - 完成版式回流优化、术语管理后台。
4. **大文件与性能优化**
   - 队列优化、分布式渲染、缓存策略完善。
5. **正式上线**
   - 完成安全审计与隐私合规，准备客户支持流程。

## 十一、所需 Cloudflare / 第三方资源

- **Cloudflare Workers**：主服务（绑定名 `pdf-translate-worker`，可沿用现有 `manga-saas` 配置并重命名）。
- **Cloudflare D1**：至少 1 个数据库（绑定 `DB` / `NEXT_TAG_CACHE_D1`），确保导入迁移后包含前缀表。
- **Cloudflare R2**：三个桶（源文件 `pdf-translate-source`、底图/缓存 `pdf-translate-previews`、译文 `pdf-translate-output`）。
- **Cloudflare Queues**：翻译任务队列（绑定名 `PDF_TRANSLATE_QUEUE`）。
- **Cloudflare Durable Objects**：`DOQueueHandler`（已在模板中声明），必要时新增 `DOTranslationCoordinator` 管理分段任务。 
- **Cloudflare KV**：`NEXT_INC_CACHE_KV` 已存在，继续用于 ISR。
- **Cloudflare Browser Rendering**：用于 HTML → PDF 渲染（Workers Paid 计划可启用）。
- **外部翻译 API**：DeepL、Google Cloud Translation、OpenAI（需配置密钥与配额）。
- **OCR 服务**：Google Vision、Azure OCR、Mathpix（视业务购买）。
- **可选服务**：Stripe/Braintree（计费）、SendGrid/Postmark（通知）、Sentry（监控）。

---

如需更多实现细节，可在 `docs/` 目录新增分阶段技术说明、API 设计或前端组件规范。

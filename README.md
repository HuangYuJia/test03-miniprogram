## 微信小程序：产品相册报价（云开发）

你给的 AppID：`wx50c4c324dea00f60`

### 功能（MVP）
- 客户端：分类、列表、详情、搜索、分享
- 管理端：分类管理、商品新增/编辑、上传图片、上下架、排序（仅管理员）
- 云开发：云数据库 + 云存储 + 云函数

### 目录结构
- `miniprogram/`：小程序前端代码
- `cloudfunctions/`：云函数

### 使用步骤（微信开发者工具）
1. 打开微信开发者工具 → 导入项目 → 选择本目录 `test03`
2. 确认 “AppID” 为 `wx50c4c324dea00f60`
3. 打开 “云开发” 面板 → 创建/选择云环境（记下环境 ID）
4. 修改云环境 ID：
   - 打开 `miniprogram/app.js`
   - 把 `env: "YOUR_CLOUD_ENV_ID"` 改成你第 3 步创建的云环境 ID
5. 在开发者工具右侧的 “云开发” 面板里：
   - 上传并部署云函数（`cloudfunctions/` 下每个函数都部署一次）
6. 在云开发控制台创建集合：`admins`、`categories`、`products`
7. 运行小程序（真机/模拟器均可）

### 初始化管理员（必须做）
1. 先运行一次小程序（任意页面都行）
2. 进入管理页 `/pages/admin/index/index`
3. 优先方式：点“复制我的 openid”，然后打开云开发控制台 → 数据库 → 集合 `admins` → 添加记录：
   - `openid`: 你的 openid
   - `role`: `"owner"`

如果你遇到 `openid` 一直拿不到，优先检查云环境 ID 是否填写正确、以及云函数是否按“创建并部署：云端安装依赖”方式部署成功。

### 云函数部署小提示
如果你发现云函数日志里还在输出 `Hello World`（模板代码），说明并没有把本地代码真正部署上去。
请在微信开发者工具中对对应云函数目录右键，选择“创建并部署：云端安装依赖（不上 node_modules）”重新部署。

### 数据集合
需要 3 个集合：
- `admins`
- `categories`
- `products`

### 云函数报错 `RuleNotExists` / `-501023`（permission denied）

控制台若出现 `RuleNotExists: rule for xxx not exists`，表示**未在云开发里为该云函数配置「可调用」安全规则**，与前端代码无关。

1. 打开 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) → **云开发** → **云函数**（或打开 [云开发控制台](https://console.cloud.tencent.com/tcb) 对应环境）。
2. 进入 **云函数安全规则**（名称可能为「安全规则」「访问控制」等，以控制台为准）。
3. 在规则 JSON 中为每个需要被小程序 `wx.cloud.callFunction` 调用的函数增加条目，例如（按需合并进你现有规则，勿直接整段覆盖丢其它配置）：

```json
{
  "*": {
    "invoke": "auth != null"
  },
  "login": { "invoke": true },
  "adminCheck": { "invoke": true },
  "categorySave": { "invoke": true },
  "productSave": { "invoke": true },
  "productToggle": { "invoke": true }
}
```

说明：`invoke: true` 表示允许调用（含未登录场景，具体以官方文档为准）；若你希望仅登录用户可调用，可沿用通配 `"invoke": "auth != null"`，但**每个函数名仍建议在规则里显式写出**，避免出现 `RuleNotExists`。详见 [云函数安全规则](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/functions/security-rules.html)。

同时请确认对应云函数已用 **「创建并部署：云端安装依赖」** 部署成功，且 `miniprogram/app.js` 里的云环境 ID 与当前环境一致。


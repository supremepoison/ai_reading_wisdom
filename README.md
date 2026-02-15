# 智慧之匙 - 微信小程序

## 项目说明

这是一个基于微信小程序的 AI 阅读伴侣应用，帮助中小学生培养阅读习惯。

## 功能特性

- 📚 **阅读打卡**：每日阅读任务打卡，连续打卡获得积分奖励
- 💬 **AI 导读**：与 AI 导师对话，深入理解书籍内容
- ✍️ **读后感生成**：回答引导问题，AI 自动生成精美读后感
- 🧠 **闯关答题**：通过答题巩固阅读内容，获得积分和勋章
- 👤 **个人中心**：查看积分、连续打卡、勋章墙和阅读档案

## 项目结构

```
wisdom-key/
├── app.js                 # 小程序入口文件
├── app.json               # 小程序配置文件
├── app.wxss               # 全局样式
├── project.config.json    # 项目配置
├── sitemap.json           # 爬虫配置
├── assets/
│   └── icons/             # SVG 图标资源
├── pages/
│   ├── home/              # 首页（打卡）
│   ├── chat/              # AI 导读
│   ├── notes/             # 读后感
│   ├── quiz/              # 闯关答题
│   └── profile/           # 个人中心
└── README.md
```

## 使用方法

### 1. 导入项目

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具
3. 选择「导入项目」
4. 选择本项目目录
5. 填写你的 AppID（或使用测试号）

### 2. 配置 API Key（可选）

如果需要使用真实的 AI 对话功能：

1. 打开 `app.js`
2. 在 `globalData.apiKey` 中填入你的 Google Gemini API Key
3. 在微信开发者工具中配置合法域名：`https://generativelanguage.googleapis.com`

> 注意：如果不配置 API Key，应用会使用模拟的 AI 回复

### 3. TabBar 图标

由于微信小程序 tabBar 只支持本地图片（PNG/JPG/JPEG），你需要：

1. 将 `assets/icons/` 目录下的 SVG 图标转换为 PNG 格式
2. 或使用在线 SVG 转 PNG 工具
3. 将转换后的 PNG 图标放在 `assets/icons/` 目录
4. 更新 `app.json` 中的图标路径后缀为 `.png`

推荐使用 81x81 像素的图标大小。

## 设计规范

### 色彩系统

| 变量名 | 色值 | 用途 |
|--------|------|------|
| `--color-bg` | #FFFDF5 | 背景色 |
| `--color-yellow` | #FFD93D | 主色调 |
| `--color-orange` | #FF8E5E | 强调色 |
| `--color-blue` | #4D96FF | 辅助色 |
| `--color-green` | #6BCB77 | 成功色 |
| `--color-text` | #4A3728 | 主文字色 |

### 圆角规范

- 小按钮/标签: `16rpx`
- 中等卡片: `32rpx`
- 大卡片: `40rpx`
- 圆形: `9999rpx`

## 技术栈

- **框架**: 微信小程序原生开发
- **样式**: WXSS (CSS 变量 + 自定义样式)
- **AI 服务**: Google Gemini API

## 迁移说明

本项目由 React + Vite + Tailwind CSS 项目迁移而来。主要改动：

| React 原版 | 小程序版本 |
|------------|-----------|
| JSX | WXML |
| CSS/Tailwind | WXSS |
| TypeScript | JavaScript |
| lucide-react | 自定义 SVG 图标 |
| @google/genai SDK | wx.request API 调用 |
| React Router | 小程序 tabBar + 页面导航 |

## 开发日志

### Day 4 (2026-02-08) - Quiz 闯关 & Notes 智能笔记

#### 🎮 Quiz 闯关系统
- **三关递进机制**：基础题 → 理解题 → 挑战题，完成一关后弹窗询问是否继续
- **AI 智能出题**：云函数 `generateQuiz` 调用 DeepSeek API 生成针对当前章节的选择题
- **Write-Through Cache**：先查数据库 `questions` 集合，没有则 AI 生成并存库，后续用户秒开
- **结果页**：`pages/quiz-result` 展示总分、答对题数、金杯/铜牌 emoji
- **积分系统**：答对一题 +20 积分，同步到全局 `app.globalData.userPoints`

#### ✍️ Notes 智能笔记
- **动态问题生成**：云函数 `generateNoteQuestions` 根据书籍/章节生成 5 个引导问题
- **AI 润色读后感**：云函数 `generateNote` 将用户回答润色成 200-300 字读后感
- **章节级别**：问题和读后感都针对当前章节，而非整本书
- **持久化存储**：生成的读后感保存到 `notes` 集合
- **降级机制**：AI 不可用时自动使用 Mock 数据，保证用户体验

#### 🔧 技术改进
- **云函数架构**：统一使用 DeepSeek API，配置通过环境变量或 `constants.js` 管理
- **配置同步脚本**：`sync-config.sh` 一键同步 API Key 到所有云函数
- **错误处理增强**：所有 AI 调用都有完善的 try-catch 和降级逻辑
- **Loading 状态**：Quiz 和 Notes 页面都有友好的加载动画

#### 📦 新增云函数
| 云函数 | 功能 |
|--------|------|
| `generateQuiz` | AI 出题（支持数据库缓存） |
| `generateNote` | AI 生成读后感 |
| `generateNoteQuestions` | AI 生成引导问题 |

#### 🗄️ 数据库集合
| 集合名 | 用途 |
|--------|------|
| `questions` | 缓存 AI 生成的 Quiz 题目 |
| `notes` | 存储用户的读后感 |
| `note_questions` | 缓存章节对应的引导问题 |

#### ⏳ 待完成 (Day 5)
- [ ] Profile 个人主页完善
- [ ] 积分同步到云端 `users` 表
- [ ] 历史读后感列表展示
- [ ] 分享功能实现

---

### Day 3 (2026-02-07) - AI Chat & 打卡系统

- 首页打卡功能完善
- AI 导读对话接入 DeepSeek
- 云函数 `chatWithAI` 实现
- 打卡云函数 `checkin` 实现
- 积分和连续天数统计

---

### Day 1-2 (2026-02-05~06) - 项目初始化

- 从 React 项目迁移到微信小程序
- 搭建项目结构
- 实现全局样式系统
- 创建基础页面框架

---

## License

MIT License

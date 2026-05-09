# AC-Search-Local

> 本项目是基于原作者 [AC](https://greasyfork.org/scripts/14178) 的 GPL-3.0 开源项目的改造版本，仅供学习交流使用。

> **声明：本项目完全使用 [opencode](https://opencode.ai) + DeepSeek V4 Pro 辅助完成编写、调试、审查和优化。所有代码修改均经过自动化语法检查和人工验证。**

## 功能

| 功能 | 说明 |
|------|------|
| 去重定向 | 绕过百度/Google/Bing/DuckDuckGo 搜索结果中的跳转链接 |
| 去广告 | 移除搜索广告（Baidu/Google/Bing/Haosou） |
| Favicon | 搜索结果旁显示网站图标 |
| 暗黑模式 | 自动跟随系统 `prefers-color-scheme` |
| 多列布局 | 单列居中 / 双列 / 三列 / 四列 |
| 域名拦截 | 自定义域名黑名单，隐藏或移除匹配结果 |
| 自动翻页 | 滚动到底部自动加载下一页 |
| 浮动设置面板 | Vue 3 可拖拽面板，实时切换功能 |

## 支持引擎

百度 · Google · Bing · DuckDuckGo · DogeDoge · 好搜(360) · 百度学术 · Google Scholar

## 与原版的区别

- **零外部依赖**（除 Vue 3 CDN），去除 Less.js 运行时编译，22 个 `.less` 文件预编译为 CSS 嵌入
- **本地化 CSS 嵌入**，无外部样式请求，避免第三方 CDN 不可用导致脚本失效
- **自定义 `@namespace`**，不与 GreasyFork 自动更新冲突
- **自动化翻页修复**（Bing、Google、百度） — 函数式查找下一页链接 + URL 去重 + 链接推进
- **Bing 广告移除** — 支持 `.b_ad` XPath + 新版伪元素 content 检测
- **DuckDuckGo 布局修正** — React DOM 对齐 + MutationObserver
- **Bing 图文卡片 Flex 修复** — 对抗 `overflow: hidden` BFC 副作用
- **性能优化** — rAF 分批处理、QSA `:not()` 过滤、Observer 超时 disconnect、batchSize 10→25
- **Vue 3 浮动设置面板** — 可拖拽、实时切换、自动保存

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 `AC-Search-Local.user.js` 文件
3. Tampermonkey 自动识别并提示安装

## 配置

右下角 ⚙️ 浮动按钮 → 打开 Vue 3 设置面板。

## 文件说明

| 文件 | 说明 |
|------|------|
| `AC-Search-Local.user.js` | 主脚本文件 |
| `references/` | 原始参考文件（gitignore 排除） |
| `backups/` | 版本迭代备份（gitignore 排除） |

## 版本

v1.0.16

## 协议

GPL-3.0-only — 继承自原作者 [AC](https://greasyfork.org/scripts/14178)

## 致谢

原始脚本 [AC-baidu-重定向优化百度搜狗谷歌必应搜索_favicon_双列](https://greasyfork.org/scripts/14178) by AC (2015-2026)

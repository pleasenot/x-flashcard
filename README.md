# X 帖子收藏卡

公开可浏览的静态站点，用来翻看已收藏的 X 帖子。按分类筛选、搜索标题或作者，卡片可左右切换、点按翻转，长文再展开阅读，并跳回原帖。

本站为纯静态页面，不含账号系统，也不依赖后端接口。数据来自本地整理的收藏档案。

## 本地预览

在本目录下启动一个静态服务器后，用浏览器打开提示的地址：

```bash
python3 -m http.server
```

默认地址是 http://127.0.0.1:8000 。请不要直接用 `file://` 打开 `index.html`，否则浏览器可能拦下本地 JSON 与全文的读取。

## 部署到 GitHub Pages

把本目录作为仓库根目录推送即可（含 `index.html`、`css/`、`js/`、`data/`、`media/`）。在仓库的 Pages 设置里，源选主分支的根目录。

路径都是相对路径，适合项目站点，也适合用户站点（`username.github.io`）。自定义域名不是必须的。

字体由 Google Fonts 加载（Sora、思源黑体、思源宋体）。若部署环境访问 Google 不稳定，页面仍可阅读，只是会暂时回退到系统字体。

仓库根目录附有 `.nojekyll`，避免 GitHub Pages 用 Jekyll 处理静态文件。

## 目录说明

- `index.html`：页面入口
- `css/styles.css`、`js/app.js`、`js/holo-studio.js`：样式与交互；当前卡片由官方镭射查看器以三维卡呈现
- `vendor/holo-card-studio/`：官方流水线导出的 `card.glb` 与 MIT 许可声明
- `vendor/three/`：Three.js 0.180.0（与官方查看器同一版本）
- `media/holo/`：每张收藏卡的官方四图层（主体、背景、线稿、文字）
- `data/cards.json`：全部收藏卡数据
- `data/articles/`：较长文章的全文（点「阅读全文」时再加载）
- `media/`：封面与配图（已压缩为 WebP）
- `scripts/build-data.py`：若收藏档案有更新，可重新生成数据和图片

## 使用说明

- 顶部芯片可按分类筛选，数字是当前可见数量
- 搜索框匹配标题、作者、简介和笔记
- 左右滑动、两侧箭头或键盘方向键切换卡片
- 拖动卡片看镭射光泽；点按或「翻转」看背面；「阅读」打开全文
- `Esc` 关闭全文或图片，或把已翻转的卡片翻回来

镭射箔面来自 [Holo Card Studio](https://github.com/EverettFish/holo-card-studio)（MIT，Copyright 2026 Holo Card Studio contributors）：官方 Blender 流水线导出的三维卡，以及官方 Three.js 着色器（光谱箔、星点、掠射光、景深视差与 bloom）。本站只保留自己的「月青藏柜」界面，并按收藏卡切换图层。若系统开启了「减少动态效果」，箔面动画会静止。

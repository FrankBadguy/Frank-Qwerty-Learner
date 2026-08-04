# Qwerty Learner（本地部署版）

英语单词肌肉记忆打字练习 —— 基于 [Kaiyiwing/qwerty-learner](https://github.com/Kaiyiwing/qwerty-learner) 的独立 Web 版本，可本地运行或部署到任意静态服务器。

## 功能特色

- **词典打字练习**：内置 COCA 20000、四六级、考研、GRE 等 60+ 词典（`public/dicts/`）
- **翻转练习**：结果页或按 `Alt+F` 进入，英文四选一中文释义，含同章节干扰项
- **发音**：内置词典音效 + Edge TTS 在线朗读（释义/例句），开发模式带本地 TTS 代理
- **界面**：英文 Georgia 字体、全站中文加粗排版，深色模式
- **开机自启**：macOS launchd 服务化，详见 [SERVICE_GUIDE.md](SERVICE_GUIDE.md)

## 快速开始

```bash
npm install
npm run dev      # 开发模式
npm run build    # 构建产物到 dist/
npm run preview  # 本地预览构建产物
```

## 目录结构

```
public/dicts/           词典数据（JSON）
src/hooks/              发音 / TTS 相关 hooks
vite-plugin-tts-proxy.ts  开发模式下的 Edge TTS 代理
service-manager.sh      launchd 服务管理脚本
```

## 许可证

[GPL-3.0](LICENSE)。本项目基于 [qwerty-learner](https://github.com/Kaiyiwing/qwerty-learner) 修改，感谢原作者及所有贡献者。

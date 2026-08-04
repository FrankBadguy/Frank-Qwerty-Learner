# Qwerty Learner 本地服务部署指南

## 服务状态

✅ **当前状态**: 运行中  
✅ **访问地址**: http://localhost:2026  
✅ **局域网地址**: http://192.168.3.112:2026  
✅ **HTTP 状态**: 200 OK  
✅ **运行模式**: 局域网模式（同局域网设备可访问）  
✅ **开机自启**: launchd 托管（`~/Library/LaunchAgents/com.qwerty.learner.plist`）  
✅ **项目路径**: `/Users/a1-6/UTools-Qwerty-Learner-main`（已从 `~/Documents` 移出，因 TCC 权限限制）

---

## 快速开始

### 1. 服务管理命令

所有服务管理操作通过 `service-manager.sh` 脚本完成：

```bash
# 启动服务（默认局域网模式，绑定 0.0.0.0）
./service-manager.sh start

# 仅本机模式启动（绑定 127.0.0.1）
./service-manager.sh start --local

# 停止服务
./service-manager.sh stop

# 重启服务（不带参数沿用当前模式，可加 --lan / --local 切换）
./service-manager.sh restart
./service-manager.sh restart --local

# 查看服务状态
./service-manager.sh status

# 查看实时日志
./service-manager.sh logs

# 健康检查
./service-manager.sh health

# 局域网共享诊断（IP / 防火墙 / 监听验证）
./service-manager.sh lan-check
```

### 2. 开机自启动配置

**已安装** ✅。launchd 直接托管 `vite preview`（进程崩溃自动拉起），脚本退化为手动/诊断工具。

```bash
# 安装（一键完成 plist 复制 + launchd 加载）
./install-launchd.sh install

# 查看自启状态
./install-launchd.sh status

# 卸载（停止开机自启）
./install-launchd.sh uninstall
```

手动操作（等价于 install）：
```bash
cp com.qwerty.learner.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.qwerty.learner.plist

# 验证服务是否已加载
launchctl list | grep qwerty
```

---

## 服务特性

### 1. 运行模式

支持两种运行模式，通过 `--lan` / `--local` 参数控制：

| 模式 | 监听地址 | 访问范围 |
|------|---------|---------|
| **局域网模式**（默认，`--lan`） | `0.0.0.0` | 本机 + 同局域网所有设备 |
| **仅本机模式**（`--local`） | `127.0.0.1` | 仅本机 |

- ✅ 运行模式持久化到 `/tmp/qwerty-learner.mode`，`restart` 不带参数时沿用当前模式
- ✅ `status` 命令显示当前模式、监听地址、局域网访问地址和防火墙状态
- ✅ 启动前检测端口占用，自动终止占用端口的进程
- ✅ 使用 `--strictPort`，端口被占用时直接失败而不是自动换端口

### 2. 持续运行保障
- ✅ **KeepAlive 配置**: launchd 会在服务异常退出时自动重启
- ✅ **SuccessfulExit=false**: 仅在非正常退出时重启
- ✅ **ThrottleInterval=10**: 防止频繁重启（最小间隔 10 秒）
- ✅ **PID 文件管理**: 跟踪服务进程状态

### 3. 资源监控
- ✅ **日志系统**: 
  - 标准输出: `logs/qwerty-learner.log`
  - 错误日志: `logs/qwerty-learner-error.log`
  - Launchd 日志: `logs/launchd-stdout.log`, `logs/launchd-stderr.log`
- ✅ **进程监控**: 通过 `status` 命令查看 CPU、内存占用
- ✅ **健康检查**: 通过 `health` 命令验证服务响应

### 4. 自动构建
- ✅ 启动前自动执行 `npm run build`
- ✅ 构建失败时中止启动并记录错误
- ✅ 使用生产环境配置（`vite preview`）

---

## 常用操作示例

### 场景 1: 日常使用（局域网共享）
```bash
# 启动服务
cd /Users/a1-6/UTools-Qwerty-Learner-main
./service-manager.sh start

# 本机打开浏览器访问
open http://localhost:2026

# 局域网其他设备访问
# 浏览器打开 http://192.168.3.40:2026
```

### 场景 2: 切换运行模式
```bash
# 切换为仅本机模式
./service-manager.sh restart --local

# 切换回局域网模式
./service-manager.sh restart --lan
```

### 场景 3: 检查服务状态
```bash
# 查看详细状态
./service-manager.sh status

# 输出示例：
# === Qwerty Learner 服务状态 ===
# 状态: 运行中
# PID: 24304
# 端口: 2026
# 运行模式: 局域网模式（同局域网设备可访问）
# 监听地址: 0.0.0.0
# 本机访问: http://localhost:2026
# 局域网访问: http://192.168.3.40:2026
# 
# === 进程信息 ===
#   PID  PPID  %CPU %MEM ELAPSED COMMAND
# 24304     1   0.0  0.4   00:05 npm exec vite preview --port 2026 --host 0.0.0.0 --strictPort
```

### 场景 4: 局域网访问故障排查
```bash
# 运行诊断命令，检查 IP / 防火墙 / 监听情况
./service-manager.sh lan-check

# 若 macOS 防火墙开启导致设备无法访问，放行 node 进程：
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)
```

### 场景 5: 更新代码后重启
```bash
# 重启服务（会自动重新构建，沿用当前模式）
./service-manager.sh restart
```

---

## 日志文件位置

所有日志文件位于项目目录下的 `logs/` 文件夹：

```
/Users/a1-6/UTools-Qwerty-Learner-main/logs/
├── qwerty-learner.log          # 服务标准输出
├── qwerty-learner-error.log    # 服务错误日志
├── launchd-stdout.log          # Launchd 标准输出
└── launchd-stderr.log          # Launchd 错误日志
```

**查看日志**:
```bash
# 实时查看服务日志
tail -f logs/qwerty-learner.log

# 查看错误日志
tail -f logs/qwerty-learner-error.log

# 查看最近 100 行
tail -n 100 logs/qwerty-learner.log
```

---

## 故障排除

### 问题 1: 端口被占用
```bash
# 查看占用端口的进程
lsof -i :2026

# 手动终止进程
kill -9 <PID>

# 或使用服务脚本重启（会自动处理）
./service-manager.sh restart
```

### 问题 2: 服务无法启动
```bash
# 1. 检查 Node.js 版本
node --version

# 2. 重新安装依赖
npm install

# 3. 手动构建测试
npm run build

# 4. 查看错误日志
cat logs/qwerty-learner-error.log
```

### 问题 3: 局域网设备无法访问
```bash
# 1. 确认服务以局域网模式运行（监听 0.0.0.0）
./service-manager.sh status

# 2. 运行诊断命令
./service-manager.sh lan-check

# 3. 确认两台设备在同一局域网（如连接同一 Wi-Fi）
ifconfig | grep "inet "

# 4. 确认本机 IP 未变化（DHCP 可能重新分配 IP）
ipconfig getifaddr en0

# 5. 若 macOS 防火墙开启，放行 node 进程：
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)
```

### 问题 4: Launchd 服务未生效
```bash
# 1. 检查 plist 语法
plutil -lint ~/Library/LaunchAgents/com.qwerty.learner.plist

# 2. 重新加载服务
launchctl unload ~/Library/LaunchAgents/com.qwerty.learner.plist
launchctl load ~/Library/LaunchAgents/com.qwerty.learner.plist

# 3. 查看 launchd 日志
cat logs/launchd-stderr.log
```

### 问题 5: 服务频繁重启
```bash
# 1. 检查错误日志
tail -n 50 logs/qwerty-learner-error.log

# 2. 检查系统资源
top -p $(cat /tmp/qwerty-learner.pid)

# 3. 临时停止 launchd 自动重启
launchctl unload ~/Library/LaunchAgents/com.qwerty.learner.plist
```

---

## 高级配置

### 修改端口号
编辑 `service-manager.sh` 文件，修改以下行：
```bash
PORT=2026  # 改为其他端口，如 3000
```

然后更新 `com.qwerty.learner.plist` 中的相关配置（如有需要）。

### 修改默认运行模式
编辑 `service-manager.sh` 文件，修改以下行：
```bash
DEFAULT_MODE="lan"  # 改为 "local" 则默认仅本机访问
```

### 修改启动参数
编辑 `service-manager.sh` 中的 `start()` 函数，修改 vite preview 命令：
```bash
nohup npx vite preview --port $PORT --host $host --strictPort >> "$LOG_FILE" 2>> "$ERROR_LOG_FILE" &
```

其中 `$host` 由运行模式决定（`lan` → `0.0.0.0`，`local` → `127.0.0.1`）。可添加参数如：
- `--open`: 自动打开浏览器
- `--https`: 启用 HTTPS

### 自定义日志轮转
添加日志轮转功能，防止日志文件过大：
```bash
# 在 service-manager.sh 中添加
rotate_logs() {
    local max_size=10485760  # 10MB
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE") -gt $max_size ]; then
        mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d%H%M%S)"
        touch "$LOG_FILE"
    fi
}
```

---

## 性能优化建议

### 1. 启用 Gzip 压缩
Vite preview 默认启用 gzip，无需额外配置。

### 2. 配置缓存策略
`vite.config.ts` 中已配置开发服务器端口，生产预览端口由 `service-manager.sh` 中的 `PORT` 控制。

### 3. 监控资源使用
```bash
# 实时监控进程资源
watch -n 1 'ps -p $(cat /tmp/qwerty-learner.pid) -o pid,ppid,%cpu,%mem,rss,vsz,etime'
```

---

## 安全建议

1. **局域网模式**: 服务绑定 `0.0.0.0`，同局域网内所有设备均可访问。仅用于可信网络环境。
2. **仅本机模式**: 如无需局域网共享，使用 `./service-manager.sh start --local` 或修改 `DEFAULT_MODE="local"`，服务仅绑定 `127.0.0.1`。
3. **防火墙配置**: 局域网模式下若 macOS 防火墙开启，需放行 node 进程（见故障排除问题 3）。
4. **定期更新**: 保持 Node.js 和项目依赖为最新稳定版。
5. **日志审计**: 定期检查日志文件，发现异常及时处理。

---

## 技术支持

如遇问题，请按以下步骤排查：

1. 运行 `./service-manager.sh health` 检查服务健康状态
2. 运行 `./service-manager.sh lan-check` 诊断局域网共享问题
3. 查看 `logs/qwerty-learner-error.log` 错误日志
4. 检查端口占用情况 `lsof -i :2026`
5. 验证 Node.js 环境 `node --version && npm --version`

---

**最后更新**: 2026-08-16  
**服务版本**: qwerty-learner@1.0.0  
**Node.js 版本**: v24.13.1

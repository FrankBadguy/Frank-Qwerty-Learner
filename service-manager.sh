#!/bin/bash

# Qwerty Learner 服务管理脚本
# 架构说明：
#   - 开机自启由 launchd 托管（com.qwerty.learner.plist -> ~/Library/LaunchAgents/），
#     launchd 直接运行 vite preview（--port 2026），进程崩溃时自动拉起。
#   - 本脚本用于手动启动/停止/重启/查看状态（手动模式，非 launchd 托管）。
#   - 支持局域网(LAN)共享：绑定 0.0.0.0，同局域网设备可访问。

set -e

APP_NAME="qwerty-learner"
APP_DIR="/Users/a1-6/UTools-Qwerty-Learner-main"
PORT=2026
PID_FILE="/tmp/${APP_NAME}.pid"
MODE_FILE="/tmp/${APP_NAME}.mode"
LOG_FILE="${APP_DIR}/logs/${APP_NAME}.log"
ERROR_LOG_FILE="${APP_DIR}/logs/${APP_NAME}-error.log"

# 默认运行模式: lan=局域网共享(0.0.0.0), local=仅本机(127.0.0.1)
DEFAULT_MODE="lan"

# launchd 环境下 PATH 精简、不含 nvm，这里自动把 nvm 的 node 目录加入 PATH
NVM_NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$NVM_NODE_BIN" ] && [ -x "$NVM_NODE_BIN/node" ]; then
    case ":$PATH:" in
        *":$NVM_NODE_BIN:"*) ;;
        *) export PATH="$NVM_NODE_BIN:$PATH" ;;
    esac
fi

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 确保日志目录存在
mkdir -p "${APP_DIR}/logs"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# 获取默认路由网卡（当前活动的有线/无线网卡）
get_default_iface() {
    route -n get default 2>/dev/null | awk '/interface:/{print $2}'
}

# 获取局域网 IP（多级回退）
get_lan_ip() {
    local iface ip
    # 1. 优先使用默认路由网卡
    iface=$(get_default_iface)
    if [ -n "$iface" ]; then
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
        if [ -n "$ip" ]; then
            echo "$ip"
            return 0
        fi
    fi
    # 2. 遍历常见网卡
    for iface in en0 en1 en2 en3 en4 en5 bridge0 bridge1; do
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
        if [ -n "$ip" ]; then
            echo "$ip"
            return 0
        fi
    done
    # 3. 解析 ifconfig 输出（最后一个兜底手段）
    ip=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')
    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi
    echo "127.0.0.1"
}

# 读取当前网络模式（持久化在 MODE_FILE）
get_mode() {
    local mode
    if [ -f "$MODE_FILE" ]; then
        mode=$(cat "$MODE_FILE")
        if [ "$mode" = "lan" ] || [ "$mode" = "local" ]; then
            echo "$mode"
            return 0
        fi
    fi
    echo "$DEFAULT_MODE"
}

# 校验网络模式参数是否合法
valid_mode() {
    [ "$1" = "lan" ] || [ "$1" = "local" ]
}

# 根据当前模式返回监听地址
get_host() {
    if [ "$(get_mode)" = "lan" ]; then
        echo "0.0.0.0"
    else
        echo "127.0.0.1"
    fi
}

# 检查端口是否被占用
check_port() {
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # 端口被占用
    else
        return 1  # 端口可用
    fi
}

# 获取占用端口的进程 PID
get_port_pid() {
    lsof -Pi :$PORT -sTCP:LISTEN -t 2>/dev/null || echo ""
}

# 杀死占用端口的进程
kill_port_process() {
    local pid=$(get_port_pid)
    if [ -n "$pid" ]; then
        log_warn "端口 $PORT 被进程 $pid 占用，正在终止..."
        kill -9 $pid 2>/dev/null || true
        sleep 1
        log_info "已终止占用端口的进程"
    fi
}

# 检查服务是否正在运行（launchd 托管时 PID 文件不存在，按端口判断）
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    check_port
}

# 检查服务是否监听在通配地址(0.0.0.0 / ::)，即局域网可访问
lan_listening() {
    lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $9}' | grep -qE '^(\*|0\.0\.0\.0|\[::\]):'
}

# 读取 macOS 应用防火墙状态 (0=关闭, 1=开启, 2=开启并阻止所有入站)
get_firewall_state() {
    defaults read /Library/Preferences/com.apple.alf globalstate 2>/dev/null || echo "unknown"
}

# 由 launchd 托管运行时的启动入口（构建 + 前台运行 vite preview，直接与 launchd 关联）
launchd_run() {
    log_info "launchd 托管启动: 构建生产版本..."
    cd "$APP_DIR"
    npm run build >> "$LOG_FILE" 2>&1 || { log_error "构建失败，请检查日志: $LOG_FILE"; exit 1; }
    log_info "构建完成，启动 vite preview (端口: $PORT, 监听: $1)..."

    # 前台运行，launchd 直接管理此进程；崩溃退出时由 KeepAlive 自动拉起
    exec npx vite preview --port "$PORT" --host "$1" --strictPort
}

# 启动服务（手动模式）: start [--lan|--local]
start() {
    local mode="${1:-$DEFAULT_MODE}"
    mode="${mode#--}"  # 兼容 --lan / --local 写法
    if ! valid_mode "$mode"; then
        log_error "无效模式: $mode (可选: --lan / --local)"
        return 1
    fi

    log_info "启动 Qwerty Learner 服务 (手动模式)..."
    log_warn "提示: 开机自启由 launchd 托管，无需手动启动；如需启用请执行 ./install-launchd.sh"

    # 检查是否已在运行
    if is_running; then
        log_warn "服务已在运行中（端口 $PORT 已被占用）"
        log_warn "当前模式: $(get_mode)（如需切换模式请先 stop 再 start）"
        return 0
    fi

    # 检查并释放端口
    if check_port; then
        kill_port_process
    fi

    # 构建生产版本
    log_info "构建生产版本..."
    cd "$APP_DIR"
    if ! npm run build >> "$LOG_FILE" 2>&1; then
        log_error "构建失败，请检查日志: $LOG_FILE"
        return 1
    fi
    log_info "构建完成"

    local host="127.0.0.1"
    [ "$mode" = "lan" ] && host="0.0.0.0"

    # 启动 vite preview 服务（--strictPort: 端口被占时直接失败而不是自动换端口）
    log_info "启动 Web 服务器 (端口: $PORT, 监听: $host)..."
    cd "$APP_DIR"
    nohup npx vite preview --port $PORT --host $host --strictPort >> "$LOG_FILE" 2>> "$ERROR_LOG_FILE" &
    local pid=$!

    # 保存 PID 与运行模式
    echo $pid > "$PID_FILE"
    echo $mode > "$MODE_FILE"

    # 等待服务启动
    sleep 2

    # 验证服务是否启动成功
    if is_running && check_port; then
        log_info "服务启动成功!"
        if [ "$mode" = "lan" ]; then
            log_info "运行模式: ${BLUE}局域网模式${NC}（同局域网设备可访问）"
        else
            log_info "运行模式: ${YELLOW}仅本机模式${NC}（仅本机可访问）"
        fi
        log_info "本机访问: ${BLUE}http://localhost:$PORT${NC}"
        if [ "$mode" = "lan" ]; then
            local lan_ip=$(get_lan_ip)
            log_info "局域网访问: ${BLUE}http://$lan_ip:$PORT${NC}"
            if lan_listening; then
                log_info "监听验证: ${GREEN}已绑定 0.0.0.0，局域网可访问${NC}"
                if curl -s -m 3 -f "http://$lan_ip:$PORT" > /dev/null 2>&1; then
                    log_info "本机访问验证: ${GREEN}通过${NC}"
                else
                    log_warn "本机访问验证失败，请检查日志: $LOG_FILE"
                fi
            else
                log_warn "监听验证失败: 服务未绑定到 0.0.0.0"
            fi
            # 提示防火墙
            local fw=$(get_firewall_state)
            if [ "$fw" = "1" ] || [ "$fw" = "2" ]; then
                log_warn "macOS 防火墙已开启，若局域网设备无法访问，请放行 node 进程:"
                log_warn "  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node)"
                log_warn "  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)"
            fi
        fi
        log_info "PID: $pid"
        log_info "日志文件: $LOG_FILE"
        return 0
    else
        log_error "服务启动失败，请检查日志: $LOG_FILE"
        stop
        return 1
    fi
}

# 停止服务（手动模式）
stop() {
    log_info "停止 Qwerty Learner 服务..."

    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill $pid 2>/dev/null || true
            sleep 2

            # 如果进程还在，强制杀死
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null || true
            fi

            log_info "服务已停止"
        else
            log_warn "服务进程不存在"
        fi
        rm -f "$PID_FILE"
    else
        log_warn "PID 文件不存在"
    fi

    # 确保端口被释放
    if check_port; then
        kill_port_process
    fi
}

# 重启服务（手动模式）: restart [--lan|--local]，不带参数时沿用当前模式
restart() {
    log_info "重启 Qwerty Learner 服务..."
    stop
    sleep 1
    start "${1:-$(get_mode)}"
}

# 查看服务状态
status() {
    local mode=$(get_mode)
    echo -e "${BLUE}=== Qwerty Learner 服务状态 ===${NC}"

    # 检测是否为 launchd 托管
    local managed=false
    if launchctl list 2>/dev/null | grep -q "com.qwerty.learner"; then
        managed=true
    fi

    if is_running; then
        local pid=$(get_port_pid)
        echo -e "状态: ${GREEN}运行中${NC}"
        echo -e "PID: $pid"
        echo -e "端口: $PORT"
        echo -e "托管方式: $([ "$managed" = true ] && echo "launchd（开机自启）" || echo "手动")"
        if [ "$mode" = "lan" ]; then
            echo -e "运行模式: ${BLUE}局域网模式${NC}（同局域网设备可访问）"
        else
            echo -e "运行模式: ${YELLOW}仅本机模式${NC}（仅本机可访问）"
        fi
        echo -e "监听地址: $([ "$mode" = "lan" ] && echo "0.0.0.0" || echo "127.0.0.1")"
        echo -e "本机访问: ${BLUE}http://localhost:$PORT${NC}"
        echo -e "局域网访问: ${BLUE}http://$(get_lan_ip):$PORT${NC}"

        # 显示进程信息
        echo -e "\n${BLUE}=== 进程信息 ===${NC}"
        ps -p "$pid" -o pid,ppid,%cpu,%mem,etime,command

        # 显示日志文件大小
        if [ -f "$LOG_FILE" ]; then
            local log_size=$(du -h "$LOG_FILE" | cut -f1)
            echo -e "\n日志文件大小: $log_size"
        fi
    else
        echo -e "状态: ${RED}未运行${NC}"
        echo -e "托管方式: $([ "$managed" = true ] && echo "launchd（已加载，等待拉起）" || echo "未加载")"
        echo -e "运行模式: $mode（上次运行的模式）"
        echo -e "启动命令: ${BLUE}./service-manager.sh start [--lan|--local]${NC}"
    fi

    # 防火墙提示（局域网模式下才有意义）
    if [ "$mode" = "lan" ]; then
        local fw=$(get_firewall_state)
        case "$fw" in
            0) echo -e "\n防火墙: ${GREEN}已关闭${NC}（不影响局域网访问）" ;;
            1) echo -e "\n防火墙: ${YELLOW}已开启${NC}（若局域网设备无法访问，需放行 node 进程）" ;;
            2) echo -e "\n防火墙: ${RED}已开启且阻止所有入站连接${NC}（局域网设备将无法访问，请关闭或放行 node）" ;;
            *) echo -e "\n防火墙: 无法读取状态" ;;
        esac
    fi
}

# 查看日志
logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        log_error "日志文件不存在: $LOG_FILE"
    fi
}

# 健康检查
health_check() {
    if ! is_running; then
        log_error "服务未运行"
        return 1
    fi

    # 尝试访问服务
    if curl -s -f "http://localhost:$PORT" > /dev/null 2>&1; then
        log_info "健康检查通过: 服务响应正常"
        return 0
    else
        log_error "健康检查失败: 服务无响应"
        return 1
    fi
}

# 局域网共享诊断
lan_check() {
    echo -e "${BLUE}=== 局域网(LAN)共享诊断 ===${NC}"
    echo -e "运行模式: $(get_mode)"
    echo -e "本机 IP:  ${BLUE}$(get_lan_ip)${NC}  (默认网卡: $(get_default_iface))"

    # 防火墙状态
    local fw=$(get_firewall_state)
    case "$fw" in
        0) echo -e "防火墙: ${GREEN}已关闭${NC}（不影响局域网访问）" ;;
        1) echo -e "防火墙: ${YELLOW}已开启${NC}（需放行 node 进程，见下方命令）" ;;
        2) echo -e "防火墙: ${RED}已开启且阻止所有入站连接${NC}（局域网设备无法访问，需放行 node 或关闭防火墙）" ;;
        *) echo -e "防火墙: 无法读取状态（可能是权限不足）" ;;
    esac

    # 监听情况
    echo -e "\n${BLUE}=== 服务监听情况 ===${NC}"
    if is_running; then
        lsof -nP -iTCP:$PORT -sTCP:LISTEN
        if lan_listening; then
            echo -e "监听地址: ${GREEN}0.0.0.0（所有网卡）${NC}，局域网设备可直接访问"
        else
            echo -e "监听地址: ${RED}127.0.0.1（仅本机）${NC}，需用 --lan 模式重启"
        fi
    else
        echo -e "服务未运行"
    fi

    # 本机访问验证
    echo -e "\n${BLUE}=== 访问验证 ===${NC}"
    if curl -s -m 3 -f "http://localhost:$PORT" > /dev/null 2>&1; then
        echo -e "本机访问 http://localhost:$PORT : ${GREEN}正常${NC}"
    else
        echo -e "本机访问 http://localhost:$PORT : ${RED}失败${NC}"
    fi

    # 放行防火墙指引
    echo -e "\n${BLUE}=== 防火墙放行命令（如需） ===${NC}"
    echo -e "  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node)"
    echo -e "  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)"
    echo -e "  # 查看防火墙状态: sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate"
    echo -e ""
    echo -e "设备访问地址: ${BLUE}http://$(get_lan_ip):$PORT${NC}"
    echo -e "（请确保访问设备与 $PORT 端口防火墙规则处于同一局域网）"
}

# 主命令处理
case "$1" in
    launchd-run)
        # 供 com.qwerty.learner.plist 调用（launchd 托管模式）
        launchd_run "${2:-0.0.0.0}"
        ;;
    start)
        start "$2"
        ;;
    stop)
        stop
        ;;
    restart)
        restart "$2"
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    health)
        health_check
        ;;
    lan-check)
        lan_check
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|health|lan-check} [--lan|--local]"
        echo ""
        echo "命令说明:"
        echo "  launchd-run - 由 launchd 托管启动（开机自启，不建议手动执行）"
        echo "  start       - 启动服务（手动模式，默认局域网；加 --local 则仅本机访问）"
        echo "  stop        - 停止服务（手动模式）"
        echo "  restart     - 重启服务（手动模式，不带参数沿用当前模式，也可加 --lan/--local 切换）"
        echo "  status      - 查看服务状态"
        echo "  logs        - 查看实时日志"
        echo "  health      - 健康检查"
        echo "  lan-check   - 局域网共享诊断（IP/防火墙/监听验证）"
        echo ""
        echo "开机自启: 由 launchd 托管（~/Library/LaunchAgents/com.qwerty.learner.plist），"
        echo "          安装/卸载请使用 install-launchd.sh"
        echo ""
        echo "模式说明:"
        echo "  --lan   - 局域网模式：绑定 0.0.0.0，同局域网设备可通过 http://<本机IP>:$PORT 访问"
        echo "  --local - 仅本机模式：绑定 127.0.0.1，仅本机可访问"
        echo ""
        echo "示例:"
        echo "  $0 start            # 局域网模式启动（手动）"
        echo "  $0 start --local    # 仅本机模式启动（手动）"
        echo "  $0 lan-check        # 诊断局域网访问问题"
        exit 1
        ;;
esac

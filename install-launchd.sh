#!/bin/bash

# Qwerty Learner 开机自启（launchd）安装/卸载脚本
# 用法: ./install-launchd.sh install|uninstall|status

set -e

APP_DIR="/Users/a1-6/UTools-Qwerty-Learner-main"
PLIST_SRC="${APP_DIR}/com.qwerty.learner.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.qwerty.learner.plist"
LABEL="com.qwerty.learner"

# 确保 LaunchAgents 目录存在
mkdir -p "$HOME/Library/LaunchAgents"

install_service() {
    echo "[1/3] 安装 plist 到 LaunchAgents..."
    plutil -lint "$PLIST_SRC" >/dev/null || { echo "plist 语法错误"; exit 1; }
    cp "$PLIST_SRC" "$PLIST_DST"

    echo "[2/3] 加载 launchd 任务..."
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

    echo "[3/3] 验证..."
    sleep 3
    if launchctl list | grep -q "$LABEL"; then
        echo "✅ 开机自启已安装并加载: $LABEL"
        echo "   服务地址: http://localhost:2026"
    else
        echo "❌ launchd 任务加载失败，请查看: $APP_DIR/logs/launchd-stderr.log"
        exit 1
    fi
}

uninstall_service() {
    echo "[1/2] 卸载 launchd 任务..."
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true

    echo "[2/2] 删除 plist..."
    rm -f "$PLIST_DST"

    echo "✅ 开机自启已卸载（服务若在运行将被 launchd 终止）"
}

status_service() {
    echo "=== 开机自启状态 ==="
    if [ -f "$PLIST_DST" ]; then
        echo "plist: 已安装 ($PLIST_DST)"
    else
        echo "plist: 未安装"
    fi
    if launchctl list | grep -q "$LABEL"; then
        echo "launchd: 已加载"
    else
        echo "launchd: 未加载"
    fi
    if lsof -Pi :2026 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "服务: 运行中 (http://localhost:2026)"
    else
        echo "服务: 未运行"
    fi
}

case "${1:-status}" in
    install)   install_service ;;
    uninstall) uninstall_service ;;
    status)    status_service ;;
    *)
        echo "用法: $0 {install|uninstall|status}"
        exit 1
        ;;
esac

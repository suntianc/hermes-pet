#!/usr/bin/env bash
set -euo pipefail

ADAPTER_URL="${VIVIPET_ADAPTER_URL:-http://127.0.0.1:18765/adapter}"
AGENT="${VIVIPET_TEST_AGENT:-test-agent}"
SESSION_ID="${VIVIPET_TEST_SESSION_ID:-manual-flow-$(date +%s)}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Run a long ViviPet adapter event-flow test.

Usage:
  ./test-vivipet-agent-flow.sh

Environment:
  VIVIPET_ADAPTER_URL       default: http://127.0.0.1:18765/adapter
  VIVIPET_TEST_AGENT        default: test-agent
  VIVIPET_TEST_SESSION_ID   default: manual-flow-<timestamp>

Make sure ViviPet is running before executing this script.
EOF
  exit 0
fi

post_event() {
  local phase="$1"
  local message="$2"
  local sleep_after="${3:-1}"
  local extra="${4:-}"

  if [[ -n "$extra" ]]; then
    curl -sS -X POST "$ADAPTER_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"agent\":\"$AGENT\",\"phase\":\"$phase\",\"sessionId\":\"$SESSION_ID\",\"message\":\"$message\",$extra}" \
      >/dev/null
  else
    curl -sS -X POST "$ADAPTER_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"agent\":\"$AGENT\",\"phase\":\"$phase\",\"sessionId\":\"$SESSION_ID\",\"message\":\"$message\"}" \
      >/dev/null
  fi

  printf '[%s] %-14s %s\n' "$(date '+%H:%M:%S')" "$phase" "$message"
  sleep "$sleep_after"
}

echo "ViviPet long agent-flow test"
echo "adapter: $ADAPTER_URL"
echo "agent:   $AGENT"
echo "session: $SESSION_ID"
echo

post_event "session:start" "我开始接手一个较长的调试任务" 2

# Burst 1: should be aggregated into one activity window.
post_event "tool:start" "读取 package 配置" 0.35
post_event "tool:start" "扫描 desktop 事件入口" 0.35
post_event "tool:start" "查看 Live2D 动作索引" 0.35
post_event "tool:start" "检查 AI planner 配置" 4

# Burst 2: another dense activity window.
post_event "tool:start" "分析事件聚合器行为" 0.3
post_event "tool:start" "运行类型检查" 0.3
post_event "tool:start" "检查构建产物状态" 0.3
post_event "tool:start" "读取最近日志" 5

# Immediate user-facing moment.
post_event "waiting_user" "我需要用户确认是否继续修改表现策略" 5

# Continue after the simulated confirmation.
post_event "session:update" "用户确认继续，我开始处理问题" 1
post_event "tool:start" "定位动作不连贯原因" 0.35
post_event "tool:start" "调整表现层边界" 0.35
post_event "tool:start" "复查 GSAP 与 motion 分工" 4

# Error should bypass aggregation and get immediate AI attention.
post_event "tool:error" "测试时发现动作被旧状态覆盖" 5

# Recovery burst.
post_event "tool:start" "加入事件顺序保护" 0.35
post_event "tool:start" "重新运行构建" 0.35
post_event "tool:start" "发送回归测试事件" 4

# Success ending.
post_event "session:end" "长流程测试完成，表现链路可以复查" 1

echo
echo "Done. Tip: tail logs with:"
echo "  tail -120 '$HOME/Library/Logs/vivi-pet/main.log'"

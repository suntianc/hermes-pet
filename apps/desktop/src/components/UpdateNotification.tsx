/**
 * UpdateNotification — 自动更新通知 UI
 *
 * 在 tauri-plugin-updater 检测到新版本时显示:
 * - 横幅式通知（可收起）
 * - 下载进度条
 * - 安装/稍后按钮
 *
 * 样式匹配 ViviPet 现有设计语言，与 SpeechBubble 风格一致。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'unavailable';
  version?: string;
  notes?: string;
  progress: number;   // 0–100
  error?: string;
}

const checkIntervalMs = 30 * 60 * 1000; // 每 30 分钟自动检查一次
const initialDelayMs = 10 * 1000;        // 启动后 10 秒首次检查

export const UpdateNotification: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: 'idle', progress: 0 });
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 检查更新 ──────────────────────────────────────────────────────
  const performCheck = useCallback(async () => {
    if (state.status === 'checking' || state.status === 'downloading') return;

    setState((prev) => ({ ...prev, status: 'checking', error: undefined }));

    try {
      const update = await check();

      if (!update) {
        setState({ status: 'unavailable', progress: 0 });
        return;
      }

      setState({
        status: 'available',
        version: update.version,
        notes: update.body ?? undefined,
        progress: 0,
      });
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Update check failed',
      });
    }
  }, [state.status]);

  // ── 下载更新 ──────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'downloading', progress: 0, error: undefined }));

    try {
      const update = await check();
      if (!update) {
        setState({ status: 'unavailable', progress: 0 });
        return;
      }

      let lastProgress = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'DownloadProgress':
            // event.data 可能包含 {chunkLength, contentLength} 或类似结构
            if (event.data?.contentLength && event.data?.chunkLength) {
              const pct = Math.min(
                99,
                Math.round(
                  ((event.data.chunkLength as number) / (event.data.contentLength as number)) * 100
                )
              );
              if (pct > lastProgress) {
                lastProgress = pct;
                setState((prev) => ({ ...prev, progress: pct }));
              }
            }
            break;
          case 'DownloadFinished':
            setState((prev) => ({ ...prev, progress: 100 }));
            break;
          case 'UpdaterError':
            setState({
              status: 'error',
              progress: lastProgress,
              error: event.data ?? 'Download error',
            });
            break;
        }
      });

      // 下载并安装完成 — 准备重启
      setState((prev) => ({ ...prev, status: 'ready', progress: 100 }));
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }, []);

  // ── 安装并重启 ──────────────────────────────────────────────────
  const handleInstall = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Relaunch failed',
      });
    }
  }, []);

  // ── 关闭横幅 ────────────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // 清除定时器，不再自动检查
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── 周期性检查 ──────────────────────────────────────────────────
  useEffect(() => {
    // 启动后延迟首次检查
    const initialTimer = setTimeout(() => {
      performCheck();
    }, initialDelayMs);

    // 之后每隔 checkIntervalMs 自动检查
    intervalRef.current = setInterval(() => {
      performCheck();
    }, checkIntervalMs);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [performCheck]);

  // ── 手动检查（暴露给调试/UI） ──────────────────────────────────
  const handleRetry = useCallback(() => {
    performCheck();
  }, [performCheck]);

  // ── 渲染 ────────────────────────────────────────────────────────
  if (dismissed) return null;

  const visible =
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'ready' ||
    state.status === 'error' ||
    state.status === 'checking';

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          margin: 8,
          background: 'rgba(30, 41, 59, 0.95)',
          color: '#f1f5f9',
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.4,
        }}
      >
        {/* 左侧图标 */}
        <div style={{ flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {state.status === 'checking' && (
            <span style={{ fontSize: 18, opacity: 0.7 }}>⟳</span>
          )}
          {state.status === 'available' && (
            <span style={{ fontSize: 18 }}>⬇</span>
          )}
          {state.status === 'downloading' && (
            <span style={{ fontSize: 14 }}>⋯</span>
          )}
          {state.status === 'ready' && (
            <span style={{ fontSize: 18, color: '#4ade80' }}>✓</span>
          )}
          {state.status === 'error' && (
            <span style={{ fontSize: 18, color: '#f87171' }}>⚠</span>
          )}
        </div>

        {/* 中间内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {state.status === 'checking' && (
            <span>Checking for updates…</span>
          )}

          {state.status === 'available' && (
            <div>
              <strong>Update available v{state.version}</strong>
              {state.notes && (
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {state.notes}
                </div>
              )}
            </div>
          )}

          {state.status === 'downloading' && (
            <div>
              <strong>Downloading update…</strong>
              <div
                style={{
                  marginTop: 4,
                  height: 4,
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${state.progress}%`,
                    height: '100%',
                    background: '#60a5fa',
                    borderRadius: 2,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          )}

          {state.status === 'ready' && (
            <span>
              <strong>Update ready!</strong> Restart to apply v{state.version}
            </span>
          )}

          {state.status === 'error' && (
            <div>
              <span style={{ color: '#f87171' }}>Update failed: {state.error}</span>
              <br />
              <button
                onClick={handleRetry}
                style={{
                  marginTop: 4,
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: '#f1f5f9',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* 右侧按钮 */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {state.status === 'available' && (
            <>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#cbd5e1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Later
              </button>
              <button
                onClick={handleDownload}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Update
              </button>
            </>
          )}

          {state.status === 'ready' && (
            <button
              onClick={handleInstall}
              style={{
                background: '#22c55e',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Restart
            </button>
          )}

          {state.status === 'downloading' && (
            <button
              onClick={handleDismiss}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#cbd5e1',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Hide
            </button>
          )}

          {state.status === 'error' && (
            <button
              onClick={handleDismiss}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#cbd5e1',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          )}

          {state.status === 'checking' && null}
        </div>
      </div>
    </div>
  );
};

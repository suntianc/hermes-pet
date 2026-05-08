# Rive Model Integration Guide

> 本文档说明如何在 ViviPet 桌面应用中集成 Rive (`.riv`) 模型。
> 适用于模型制作者和应用开发者。

---

## 目录

- [1. 概述](#1-概述)
- [2. SM 输入命名约定 (State Machine Inputs)](#2-sm-输入命名约定-state-machine-inputs)
- [3. `state` 值映射表](#3-state-值映射表)
- [4. 文件放置位置](#4-文件放置位置)
- [5. models.json 配置](#5-modelsjson-配置)
- [6. vivipet-assets 协议](#6-vivipet-assets-协议)
- [7. 项目相关文件与路径汇总](#7-项目相关文件与路径汇总)

---

## 1. 概述

ViviPet 在 Phase 4 中完成了从 Live2D 到 Rive 的模型系统迁移。应用通过 Rive State Machine (SM) 驱动模型动画，无需外部动作索引（D-09）。

集成一个 `.riv` 模型只需要三步：

1. 准备符合 SM 输入约定的 `.riv` 文件
2. 将文件放入指定目录
3. 在 `models.json` 注册表中添加模型条目

---

## 2. SM 输入命名约定 (State Machine Inputs)

Rive 模型必须定义以下 State Machine 输入（大小写敏感），应用通过 `rive-inputs.ts` 中的常量向 SM 发送值：

| Input Name    | Type    | Range       | 用途                                    |
|---------------|---------|-------------|-----------------------------------------|
| `state`       | Number  | `0` – `9`   | 主动画状态，控制模型展示不同情绪/行为      |
| `mouth_open`  | Number  | `0.0`–`1.0` | TTS 语音合成嘴型同步幅度                   |
| `look_x`      | Number  | `-1.0`–`1.0`| 鼠标水平位置跟踪（-1=左, 0=中, 1=右）      |
| `look_y`      | Number  | `-1.0`–`1.0`| 鼠标垂直位置跟踪（-1=下, 0=中, 1=上）      |
| `blink`       | Trigger | fire         | 眨眼动画触发                              |
| `breathe`     | Trigger | fire         | 呼吸动画触发                              |

**源码路径：** `apps/desktop/src/features/pet/rive-inputs.ts`

```typescript
export const RIVE_INPUTS = {
  STATE: 'state',
  BLINK_TRIGGER: 'blink',
  BREATHE_TRIGGER: 'breathe',
  MOUTH_OPEN: 'mouth_open',
  LOOK_X: 'look_x',
  LOOK_Y: 'look_y',
} as const;
```

> **注意：** SM 输入名称为硬编码常量，必须在 Rive 编辑器中以完全相同的名称定义（D-10）。不同的大小写或拼写将导致 SM 无法接收输入值。

---

## 3. `state` 值映射表

`state` Number 输入控制模型的整体动画状态。应用根据当前事件类型（如 idle、thinking、speaking）设置对应的值：

| 值 (Number) | 名称 (RiveStateValue) | 描述           | 典型触发场景                |
|-------------|----------------------|----------------|---------------------------|
| `0`         | `idle`               | 空闲状态        | 无事件、等待用户输入         |
| `1`         | `thinking`           | 思考中          | AI 正在处理请求             |
| `2`         | `speaking`           | 说话中          | TTS 播放语音               |
| `3`         | `happy`              | 高兴            | 任务完成、成功响应           |
| `4`         | `error`              | 出错            | API 错误、处理失败           |
| `5`         | `searching`          | 搜索中          | 查询、文件搜索               |
| `6`         | `coding`             | 编码中          | 代码生成、编辑器事件          |
| `7`         | `terminal`           | 终端操作中       | 执行命令、终端输出           |
| `8`         | `confused`           | 困惑            | 不确定的输入、需要澄清        |
| `9`         | `angry`              | 生气            | 错误累积、需要用户注意        |

**定义位置：** `apps/desktop/src/features/pet/rive-inputs.ts`

```typescript
export type RiveStateValue =
  | 'idle' | 'thinking' | 'speaking' | 'happy' | 'error'
  | 'searching' | 'coding' | 'terminal' | 'confused' | 'angry';

export const RIVE_STATES: { value: RiveStateValue; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  // ... 共 10 个状态
];
```

> **温馨提示：** 建议在 Rive 编辑器的 SM 中为每个 state 值使用 **混合 (Blend)** 或 **状态 (State)** 节点，确保模型能平滑过渡。Trigger 输入（blink、breathe）建议设置较短的持续时间，避免动画卡顿。

---

## 4. 文件放置位置

### 4.1 内置模型 (Built-in)

将 `.riv` 文件放入 `apps/desktop/public/models/<ModelName>/` 目录：

```
apps/desktop/public/models/
└── MyPet/
    └── MyPet.riv
```

目录和文件名需与 `models.json` 中配置的 `path` 一致。应用启动时通过 `fetch()` 加载，路径以 `/models/` 开头（D-13）。

### 4.2 用户导入模型 (User-imported)

用户通过应用内的 **Import Model** 功能（系统托盘菜单 → Import Model）导入 `.riv` 文件：

1. 点击 "Import Model"
2. 在文件选择器中选择 `.riv` 文件
3. 应用自动将其复制到 `userData/models/<modelId>/` 目录
4. 同时创建 `.vivipet-registry.json` 元数据文件用于发现

用户模型通过 `vivipet-assets://` 协议访问（见第 6 节）。

### 4.3 导入模型目录结构

```
{userData}/
└── models/
    └── <modelId>/
        ├── model.riv
        └── .vivipet-registry.json
```

其中 `{userData}` 取决于操作系统：

| 平台    | 默认路径                                                     |
|---------|--------------------------------------------------------------|
| macOS   | `~/Library/Application Support/ViviPet/models/`              |
| Windows | `%APPDATA%/ViviPet/models/`                                  |
| Linux   | `~/.config/ViviPet/models/`                                  |

---

## 5. models.json 配置

内置模型在 `apps/desktop/public/assets/models/models.json` 中注册。每个 `.riv` 模型条目格式如下：

```json
{
  "models": [
    {
      "id": "my-pet",
      "name": "My Pet",
      "path": "/models/my-pet/my-pet.riv",
      "type": "rive",
      "window": {
        "width": 520,
        "height": 760
      }
    }
  ]
}
```

### 字段说明

| 字段     | 类型   | 必需 | 说明                                         |
|----------|--------|------|----------------------------------------------|
| `id`     | string | 是   | 模型唯一标识符，用于内部引用和 vivipet-assets 路径 |
| `name`   | string | 是   | 模型显示名称，出现在 UI 和托盘菜单中             |
| `path`   | string | 是   | 模型文件路径，内置模型使用相对 `/models/` 路径    |
| `type`   | string | 否   | 模型类型，`.riv` 模型应为 `"rive"`（ModelType） |
| `window` | object | 否   | 窗口尺寸建议，可选 `{width, height}`             |
| `canvas` | object | 否   | 画布尺寸，可选。不设置时使用 window 或默认值      |
| `actions`| object | 否   | 动作覆盖配置，Rive SM 模型通常不需要              |
| `capabilities` | object | 否 | 能力声明，Rive SM 模型通常不需要                  |

Rive 模型不需要 `actions` 和 `capabilities` 字段 — SM 内部管理所有动画过渡（D-09）。

### 用户导入模型的 registry 格式

当用户通过 Import Model 导入 `.riv` 文件时，应用自动写入 `.vivipet-registry.json`：

```json
{
  "id": "imported_pet_abc123",
  "name": "My Custom Pet",
  "path": "vivipet-assets://models/imported_pet_abc123/model.riv",
  "type": "rive",
  "window": {
    "width": 520,
    "height": 760
  }
}
```

---

## 6. vivipet-assets 协议

### 概述

ViviPet 注册了 `vivipet-assets://` 自定义协议（D-01），用于安全地访问用户导入的模型文件。此协议在应用启动时通过 `initModelProtocol()` 注册（D-02）。

### URL 格式

```
vivipet-assets://models/<modelId>/<file>
```

示例：`vivipet-assets://models/my_pet_123/model.riv`

### 工作原理

1. 应用主进程在启动时注册 `vivipet-assets` 协议处理器
2. 渲染器发起 `fetch('vivipet-assets://models/<id>/model.riv')`
3. 主进程解析 URL，将路径映射到 `userData/models/<id>/model.riv`
4. 返回文件内容（404 如果文件不存在）

### 路径穿越防护

协议处理器包含路径穿越防护（D-01）：请求路径被约束在 `userData/models/` 目录范围内，包含 `..` 的恶意路径会被拒绝并返回 404。

### 渲染器使用示例

```typescript
const response = await fetch('vivipet-assets://models/my_pet_123/model.riv');
const buffer = await response.arrayBuffer();
const rive = new Rive({
  buffer,
  artboard: 'Main',
  stateMachine: 'StateMachine',
  autoplay: true,
});
```

### 源码参考

- **协议注册：** `apps/desktop/electron/model-manager.ts` → `initModelProtocol()`（D-02）
- **路径安全函数：** `resolveSafeUserModelPath()`（D-01 防护）

---

## 7. 项目相关文件与路径汇总

| 文件/目录 | 用途 | 角色 |
|-----------|------|------|
| `apps/desktop/public/assets/models/models.json` | 内置模型注册表 | Model 定义入口 |
| `apps/desktop/public/models/<Name>/<Name>.riv` | 内置 .riv 模型文件（需自行创建） | 模型资源 |
| `apps/desktop/src/features/pet/rive-inputs.ts` | SM 输入命名常量 | 编码绑定 |
| `apps/desktop/src/features/pet/model-registry.ts` | ModelConfig 类型和加载逻辑 | 加载运行时 |
| `apps/desktop/electron/model-manager.ts` | 模型导入、协议、用户模型扫描 | 主进程服务 |
| `{userData}/models/<id>/model.riv` | 用户导入的模型文件 | 用户模型 |
| `{userData}/models/<id>/.vivipet-registry.json` | 用户导入模型的元数据 | 用户模型发现 |
| `apps/desktop/src/features/pet/Live2DRenderer.ts` | 旧 Live2D 渲染器（保留但标记为备用） | 备用渲染 |
| `apps/desktop/electron/action-index.ts` | SQLite 动作索引（Rive 模型跳过） | 兼容层 |
| `apps/desktop/electron-builder.yml` | Electron 打包配置（extraResources） | 构建 |

---

> **文档版本：** Phase 4 (Model System Adaptation)
> **相关决策：** D-01, D-02, D-03, D-08, D-09, D-10, D-13, D-16, D-18, D-19, D-20
> **需求：** MODEL-04, MODEL-05

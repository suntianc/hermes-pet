# Live2D 模型接入规范

> 版本：1.0
> 最后更新：2026-05-03

## 概述

本文档规定了 Live2D 模型接入 ViviPet 应用的标准规范。遵循此规范的模型可以自动被应用识别和适配，无需额外的配置。

---

## 1. 目录结构

### 1.1 模型目录

每个模型应放在独立的目录中，目录名建议使用模型英文名：

```
models/
└── <ModelName>/              ← 模型目录，建议使用英文
    ├── <ModelName>.model3.json   ← 模型清单文件（必需）
    ├── <ModelName>.moc3          ← 模型骨骼数据（必需）
    ├── <ModelName>.physics3.json ← 物理模拟（可选）
    ├── <ModelName>.8192/         ← 大纹理目录（可选）
    │   └── texture_00.png
    ├── texture_00.png            ← 纹理文件（必需，至少一个）
    ├── *.motion3.json            ← 动作文件
    └── *.exp3.json               ← 表情文件
```

### 1.2 示例

```
models/MyCharacter/
├── MyCharacter.model3.json
├── MyCharacter.moc3
├── MyCharacter.physics3.json
├── texture_00.png
├── Idle.motion3.json
├── Happy.motion3.json
└── Blush.exp3.json
```

---

## 2. model3.json 规范

### 2.1 基本结构

```json
{
  "Version": 3,
  "FileReferences": {
    "Moc": "<ModelName>.moc3",
    "Textures": ["texture_00.png"],
    "Physics": "<ModelName>.physics3.json",
    "Expressions": [
      { "Name": "Blush", "File": "Blush.exp3.json" }
    ],
    "Motions": {
      "Idle": [
        { "File": "Idle.motion3.json" }
      ],
      "Happy": [
        { "File": "Happy.motion3.json" }
      ]
    }
  }
}
```

---

## 3. 动作（Motion）规范

### 3.1 动作组命名

`model3.json` 中 `Motions` 的 key 为动作组名称。**命名规则：首字母大写驼峰式**。

| 动作组名 | 对应语义 | 必需 | 说明 |
|---------|---------|------|------|
| `Idle` | 空闲待机 | ✅ **是** | 默认呼吸/站立动画 |
| `Thinking` | 思考中 | 否 | 思考/思索动作 |
| `Speaking` | 说话中 | 否 | 说话/对话动作 |
| `Happy` | 开心 | 否 | 开心/兴奋 |
| `Angry` | 生气 | 否 | 生气/不满 |
| `Confused` | 困惑 | 否 | 困惑/歪头 |
| `Surprised` | 惊讶 | 否 | 惊讶反应 |
| `Searching` | 搜索中 | 否 | 四处张望 |
| `Reading` | 阅读中 | 否 | 阅读姿态 |
| `Coding` | 编码中 | 否 | 打字/编码 |
| `Terminal` | 终端操作 | 否 | 终端工作 |
| `Success` | 成功 | 否 | 庆祝动作 |
| `Error` | 错误 | 否 | 错误反应 |
| `Sleep` | 睡眠 | 否 | 休眠动画 |
| `Wake` | 唤醒 | 否 | 唤醒动画 |
| `Dragging` | 被拖拽 | 否 | 拖拽中 |
| `Clicked` | 点击 | 否 | 点击反应 |
| `DoubleClicked` | 双击 | 否 | 双击反应 |
| `RightClickMenu` | 右键菜单 | 否 | 右键菜单打开 |

### 3.2 动作解析优先级

当播放动作时，系统按以下优先级解析：

```
① ModelConfig.actions 手动映射    ← models.json / FALLBACK_MODELS
② 动作组名匹配                    ← model3.json Motions 中的组名
③ Idle 组回退                    ← 至少保证有动画播放
```

具体算法：

```
playAction("thinking")
  → 检查 models.json 有手动配置？ → 使用配置
  → 模型有 "Thinking" 组？      → 使用 "Thinking"
  → 模型有 "thinking" 组？      → 使用 "thinking"
  → 模型有 "Idle" 组？          → 回退到 "Idle"
```

### 3.3 动作文件组织

每个动作组可以有多个 `.motion3.json` 文件，系统默认使用索引 0：

```json
{
  "Motions": {
    "Idle": [
      { "File": "Idle_A.motion3.json" },
      { "File": "Idle_B.motion3.json" }
    ]
  }
}
```

---

## 4. 表情（Expression）规范

### 4.1 表情命名

`model3.json` 中 `Expressions` 的 `Name` 字段使用英文驼峰命名：

| 表情名 | 建议文件 | 对应动作 | 说明 |
|-------|---------|---------|------|
| `Blush` | `Blush.exp3.json` | speaking, dragging, clicked | 脸红 |
| `StarEyes` | `StarEyes.exp3.json` | thinking, searching, success | 星星眼 |
| `HeartEyes` | `HeartEyes.exp3.json` | happy, doubleClicked, success | 爱心眼 |
| `DarkFace` | `DarkFace.exp3.json` | error | 脸黑/阴影 |
| `WhiteEyes` | `WhiteEyes.exp3.json` | confused, terminal | 白眼 |
| `Angry` | `Angry.exp3.json` | angry | 生气表情 |
| `Surprised` | `Surprised.exp3.json` | surprised | 惊讶 |
| `Tear` | `Tear.exp3.json` | - | 含泪 |
| `Blood` | `Blood.exp3.json` | - | 血/决心 |
| `RightHand` | `RightHand.exp3.json` | reading | 右手动作 |
| `LeftHand` | `LeftHand.exp3.json` | coding | 左手动作 |

### 4.2 表情解析

```
setExpression("StarEyes")
  → 模型有 "StarEyes" 表情？ → 加载并应用
  → 没有？                 → 忽略（不报错）
```

### 4.3 表情自动映射

如果没有在 `models.json` 中手动配置表情，系统会根据动作名自动匹配合适的表情：

| 动作 | 自动表情 |
|------|---------|
| thinking | StarEyes |
| speaking | Blush |
| happy | HeartEyes |
| success | HeartEyes |
| error | DarkFace |
| confused | WhiteEyes |
| angry | Angry |
| searching | StarEyes |
| reading | RightHand |
| coding | LeftHand |
| terminal | WhiteEyes |
| dragging | Blush |
| clicked | Blush |
| doubleClicked | HeartEyes |

---

## 5. 模型注册表（models.json）

### 5.1 基础配置

最简单的配置——只需指定模型路径，动作和表情会自动发现：

```json
{
  "models": [
    {
      "id": "my-character",
      "name": "My Character",
      "path": "/models/MyCharacter/MyCharacter.model3.json",
      "window": { "width": 500, "height": 450 },
      "canvas": { "width": 500, "height": 450 }
    }
  ]
}
```

### 5.2 手动覆盖动作映射

当需要精细化控制时，可以用 `actions` 覆盖自动发现的结果：

```json
{
  "models": [
    {
      "id": "my-character",
      "name": "My Character",
      "path": "/models/MyCharacter/MyCharacter.model3.json",
      "window": { "width": 500, "height": 450 },
      "actions": {
        "thinking": {
          "motion": { "group": "Thinking", "index": 0 },
          "expression": "StarEyes"
        },
        "clicked": {
          "motion": { "group": "Clicked", "index": 0 },
          "expression": "Blush",
          "resetExpressionAfterMs": 700
        }
      }
    }
  ]
}
```

> **注意**：`actions` 是可选的。不提供时，系统会自动按规范匹配动作和表情。
> 提供时会**完全覆盖**自动发现的结果。

---

## 6. 快速接入清单

模型创作者按此清单检查：

- [ ] 模型目录放在 `models/<ModelName>/`（位于 `public/` 下）
- [ ] `model3.json` 中 `Motions` 包含 `Idle` 组
- [ ] 有动作的组按规范命名（`Idle`, `Thinking`, `Happy` 等）
- [ ] 表情文件使用英文命名，`exp3.json` 中的 `Name` 使用驼峰
- [ ] `models.json` 中注册了模型路径
- [ ] 所有资源文件路径在 `model3.json` 中正确引用
- [ ] 纹理文件格式为 PNG

---

## 7. 向后兼容

- 旧的模型（使用不同命名）仍然可以通过 `models.json` 的 `actions` 手动映射来适配
- 没有 `actions` 配置的模型会自动回退到 `Idle` 组，保证至少有空闲动画
- `ModelConfig.actions` 手动配置优先级始终高于自动发现

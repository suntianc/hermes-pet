# 外部 Live2D 模型加载方案设计

> 记录时间：2026-05-03
> 状态：待实现

## 背景

当前 Live2D 模型完全打包在应用内（`public/Resources/` 目录），用户无法使用自己的 Live2D 模型。
本方案设计如何支持用户加载外部 Live2D 模型，同时保留内置模型的兼容性。

---

## 架构设计

### 模型来源分层

```
内置模型 (public/Resources/)    ← 应用打包自带
    +
用户模型 (userData/models/)    ← 用户通过 UI 导入
    ↓
合并模型注册表 → Live2DRenderer 统一加载
```

所有模型最终以统一的 `ModelConfig[]` 呈现给渲染层，渲染层无需关心模型来源。

### 数据流

```
用户操作 (选择 .model3.json 文件)
    ↓
主进程 (dialog.showOpenDialog + fs.readFile)
    ↓
IPC → 文件数据 (ArrayBuffer / 文件路径)
    ↓
渲染进程 → 合并到模型注册表
    ↓
Live2DRenderer 加载渲染
```

---

## 需要修改的模块

### 1. `electron/ipc.ts` — 新增 IPC 通道

```
pet:model:pickFile     → dialog.showOpenDialog({ filters: [{ name: 'model3', extensions: ['json'] }] })
                         返回选中文件路径

pet:model:readFile     → fs.readFile(path) → ArrayBuffer（通过 .webp 或 transfer 传递）

pet:model:listUserModels → 扫描 userData/models/ 目录 → 返回模型列表

pet:model:importModel → 将用户选中的模型文件复制到 userData/models/ 目录
                         生成 .vivipet-registry.json 记录元数据
```

### 2. `electron/preload.ts` — 暴露 API

```typescript
interface ElectronAPI {
  // ... 现有 API
  petModel: {
    pickModelFile: () => Promise<string | null>;        // 打开文件选择器
    readModelFile: (path: string) => Promise<ArrayBuffer>; // 读取模型文件
    listUserModels: () => Promise<ModelConfig[]>;        // 列出用户模型
    importModel: (sourcePath: string) => Promise<ModelConfig>; // 导入模型
    removeModel: (modelId: string) => Promise<void>;     // 删除用户模型
  };
}
```

### 3. `src/features/pet/model-registry.ts` — 合并模型源

```typescript
export async function loadModelConfigs(): Promise<ModelConfig[]> {
  // 1. 加载内置模型（当前逻辑）
  // 2. 加载用户模型（从 userData/models/）
  // 3. 合并去重（按 id）
  // 4. 返回完整列表
}
```

用户模型配置格式（`userData/models/<modelId>/.vivipet-registry.json`）：

```json
{
  "id": "my-custom-model",
  "name": "My Custom Model",
  "sourcePath": "/Users/xxx/Original/model3.json",
  "importedAt": "2026-05-03T12:00:00Z",
  "model3Path": "model.model3.json",
  "window": { "width": 500, "height": 500 },
  "canvas": { "width": 500, "height": 500 }
}
```

### 4. `src/features/pet/Live2DRenderer.ts` — 改造文件加载

当前 `OfficialCubismModel.load()` 内部使用 `fetch(url)` 加载所有子资源
（`.moc3`、`.exp3.json`、`.physics3.json`、`.motion3.json`、纹理图片）。

改造方案：抽象文件读取接口

```typescript
interface ModelFileReader {
  readFile(relativePath: string): Promise<ArrayBuffer>;
}

class FetchReader implements ModelFileReader {
  constructor(private baseUrl: string) {}
  async readFile(path: string): Promise<ArrayBuffer> {
    const resp = await fetch(this.baseUrl + '/' + path);
    return resp.arrayBuffer();
  }
}

class IPCReader implements ModelFileReader {
  constructor(private baseDir: string) {}
  async readFile(path: string): Promise<ArrayBuffer> {
    const fullPath = path.startsWith('/') ? path : this.baseDir + '/' + path;
    return window.electronAPI.petModel.readModelFile(fullPath);
  }
}
```

`OfficialCubismModel.load()` 接收 `ModelFileReader` 接口，不再直接调用 `fetch()`。

### 5. `src/components/PetContextMenu.tsx` — 菜单入口

在"Settings"下方增加：

```
Settings
Import External Model...   ← 新增
───
```

点击后调用 `petModel.pickModelFile()` → 导入并刷新模型列表。

### 6. Settings 页面 — 模型管理

（如后续有完整 Settings UI）在设置页面增加模型管理区域：
- 已导入的外部模型列表
- 删除模型
- 刷新/重新加载模型

---

## 用户模型文件存储位置

使用 Electron 的 `app.getPath('userData')`：

```
macOS:   ~/Library/Application Support/ViviPet/models/<modelId>/
Windows: %APPDATA%/ViviPet/models/<modelId>/
Linux:   ~/.config/ViviPet/models/<modelId>/
```

目录结构：

```
models/
└── <modelId>/
    ├── .vivipet-registry.json    ← 元数据
    ├── model.model3.json         ← 复制或引用的模型文件
    ├── model.moc3
    ├── texture_00.png
    ├── texture_01.png
    ├── *.motion3.json
    ├── *.exp3.json
    ├── *.physics3.json
    └── (其他子资源)
```

两种导入模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **复制** | 将模型文件复制到 userData | 用户想保留独立副本 |
| **符号链接** | 引用原始位置 | 模型文件大，不想重复占用空间 |

---

## 兼容性

- 内置模型路径和行为**完全不变**
- 旧版应用打包的模型不受影响
- 用户导入的外部模型与内置模型**平级**显示在模型切换菜单中
- `actions` 映射：外部模型可能没有自定义动作配置，使用默认映射（idle 动画）

---

## 实现顺序

| 步骤 | 内容 | 预估工时 |
|------|------|----------|
| 1 | 新增 IPC 通道 + preload API | 2h |
| 2 | 实现 `IPCReader` + 改造 `Live2DRenderer` | 4h |
| 3 | 实现 `model-registry.ts` 合并逻辑 | 2h |
| 4 | UI 入口（菜单 + 模型选择器） | 2h |
| 5 | 导入流程（复制/链接 + 注册） | 2h |
| 6 | 边缘情况处理 + 测试 | 2h |
| **合计** | | **约 14h (2天)** |

---

## 注意事项

1. **纹理加载**：`Live2DRenderer` 中纹理通过 `HTMLImageElement` + `onload` 异步加载，需要确保 IPC 读取的数据也能通过相同路径处理（可以将 ArrayBuffer 转为 Blob URL）
2. **物理/动画路径**：`.model3.json` 中的 `FileReferences` 路径是相对于该 JSON 文件的，用户模型需要保持目录结构完整
3. **模型验证**：导入时检查 `.moc3` 的完整性，避免导入损坏的模型导致渲染崩溃
4. **性能**：大纹理（如 8192px）的 IPC 传输可能较慢，考虑使用文件路径直读方式

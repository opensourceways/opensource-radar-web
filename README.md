# OpenSource Radar

一个面向 AI/ML 开源项目的技术雷达可视化工具，以雷达图形式呈现各项目在不同技术领域和成熟度象限中的分布，帮助团队追踪开源生态动态。

## 功能特性

- **雷达图可视化** — SVG 渲染，支持五大技术象限，四个成熟度环
- **象限详情视图** — 点击任意象限可进入详细列表，按成熟度环分组展示，支持雷达图与列表联动高亮
- **多期数据切换** — 顶部下拉菜单快速切换不同期数的数据文件，URL 同步更新支持直接分享与书签
- **文件上传** — 支持本地 `.csv` / `.xlsx` / `.xls` 文件上传，实时解析渲染
- **导出功能** — 导出 Excel 数据文件；生成包含所有象限详情的多页 PDF 报告
- **无构建依赖** — 纯 HTML / CSS / JavaScript，无需任何构建工具，直接在浏览器中运行

## 技术象限

| 象限 | 别名 |
|---|---|
| Inference | inference / Infer |
| Finetuning | finetune / FT |
| Pretraining | pretrain / PT |
| Kernel | Kernels |
| Reinforcement Learning | RL |

## 成熟度环

| 环 | 含义 |
|---|---|
| **Adopt** | 推荐采用，已被验证的成熟技术 |
| **Trial** | 建议试用，具备一定实践价值 |
| **Assess** | 值得评估，需跟踪其发展动态 |
| **Hold** | 谨慎使用，暂缓新项目引入 |

## 快速开始

无需安装任何依赖，直接用本地 HTTP 服务器打开即可（直接双击 `index.html` 因浏览器安全策略会导致 CSV 加载失败）：

```bash
# 使用 Python 内置服务器
python3 -m http.server 8080

# 或使用 Node.js
npx serve .
```

打开浏览器访问 `http://localhost:8080`。

## 数据格式

数据文件为 CSV 格式，存放在 `data/` 目录下，支持如下列：

| 列名 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 项目名称（如 `org/repo`）|
| `quadrant` | ✅ | 技术象限（见上表别名）|
| `ring` | ✅ | 成熟度环：`Adopt` / `Trial` / `Assess` / `Hold` |
| `score` | ✅ | 评分（数值，越高越靠近内环）|
| `description` | — | 项目简介 |
| `community update` | — | 社区动态摘要 |
| `movement` | — | 变动状态：`new` / `moved` / 留空表示无变化 |

## 添加新期数数据

1. 将新的 CSV 文件放入 `data/` 目录，命名格式建议为 `radar_data_YYYYMM.csv`
2. 在 `js/app.js` 的 `DATA_FILES` 数组中追加一行：

```js
const DATA_FILES = [
  { label: '2026-01', file: 'radar_data_202601.csv' },
  { label: '2026-03', file: 'radar_data_202603.csv' },
  { label: '2026-06', file: 'radar_data_202606.csv' }, // 新增
];
```

## 项目结构

```
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式
├── js/
│   ├── app.js              # 应用入口，事件绑定，视图切换
│   ├── data.js             # 数据解析（CSV / Excel）、导出
│   └── radar.js            # SVG 雷达图渲染
└── data/
    ├── radar_data_202601.csv
    └── radar_data_202603.csv
```

## 依赖

所有依赖均通过 CDN 加载，无需本地安装：

- [SheetJS (xlsx)](https://sheetjs.com/) — Excel 文件解析与导出
- [jsPDF](https://github.com/parallax/jsPDF) — PDF 生成

## License

[MIT](LICENSE)

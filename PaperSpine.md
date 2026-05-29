# PaperSpine 核心技能概述与快捷指南

> **中央 MCP 技能大库子模块 · 学术论文与报告写作神器**
> 
> 本文档是本地中央 MCP 服务端项目下关于 **PaperSpine** 技能的专属参考手册。PaperSpine 是一套专为 AI 智能体（如 Claude Code, Cursor, Cline 等）设计的“动机驱动型”学术论文与报告撰写技能包，致力于在格式、结构和论证逻辑极其关键的场景中，辅助产出高质量的学术稿件。

---

## 1. 技能核心理念 (Motivation-Driven Workflow)

与传统的、仅对文本进行句法润色的工具不同，PaperSpine 遵循**“动机与证据双螺旋”**的设计哲学：
1. **先学习，后动笔**：在撰写前强制阅读并学习目标期刊或会议的强篇范文（Exemplar Learning）。
2. **严防学术臆造**：绝对不允许虚构数据、指标、p 值、图表或实验断言。所有实验结果必须严格以作者提供的素材为准。
3. **写作 rationale 矩阵控制**：每一段正文的写作、每一个学术论点的抛出，都必须有明确对应的证据支撑（Evidence-Aware Blueprint），并记录在修改矩阵中。
4. **编译级安全审计**：在进入 LaTeX 编译阶段前，执行严苛的静态括号、环境、交叉引用配对自检，确保编译一次性通过。

---

## 2. PaperSpine 子技能版图 (12大模块)

* **`paper-spine` (主协调器)**：整个工作流的超级入口，负责路由和调度子模块。
* **`paper-spine-ui` (终端交互 TUI)**：提供美观的终端配置界面。
* **`paper-spine-intake` (配置收集)**：收集目标投稿场景、交付语言、本地文献路径等基本配置。
* **`paper-spine-research` (学术调研与范例学习)**：多 Agent 并发索引本地及网络文献，构建 SOTA 差距图。
* **`paper-spine-citation` (引文储备库)**：自动化构建至少 60 篇以上的引文支撑池，并过滤近 3 年的最新文献。
* **`paper-spine-rewrite` (手稿重构)**：在原有草稿的基础上，依据 Rationale 矩阵进行实质性重构与逻辑升级。
* **`paper-spine-build` (零草稿组装)**：根据零散的实验记录、图表、大纲和笔记，组装出结构完整的初稿。
* **`paper-spine-humanize` (降低 AI 感)**：引入多级束缚句式，从词法和句法层面润色，有效通过 AI 写作检测。
* **`paper-spine-latex` (LaTeX 编译集成)**：组装 LaTeX 源码，处理插图、图表和文献数据库，自动导出 PDF/Word。
* **`paper-spine-translate` (对照翻译)**：为所有过程文件和最终稿件生成高质量、行对行的中文翻译包。
* **`paper-spine-audit` (完备性自检)**：执行 Integrity Audit、Structured Peer Review 以及 Word 数量硬上限审计。
* **`paper-spine-update` (在线更新)**：检查并与 GitHub 原作者仓库进行热更新。

---

## 3. 本地中央 MCP 服务端集成

为了让本机的各路大模型 Agent（Cursor、Cline、Claude Code）能够直接获得 PaperSpine 的硬核分析和质量审计能力，我们已将 PaperSpine 核心 Python 脚本封装为了 MCP 工具：`paperspine_analysis`。

### ⚙️ 工具调用命令与参数对照

你可以在大模型对话中直接触发以下 Action：

| Action (动作名) | 底层调用的 python 脚本 | 作用说明 | 参数说明 |
|---|---|---|---|
| **`style_metrics`** | `style_metrics.py` | 诊断文本的学术词汇频次、句长分布、句间连接词和引文密度。 | `paths` (文件路径数组), `json` (默认 true) |
| **`latex_guard`** | `latex_guard.py` | 静态扫描 LaTeX 代码，捕获未闭合括号、冲突标记、断开的 ref。 | `paths` (主.tex文件路径), `json` |
| **`translate_guard`** | `translate_guard.py` | 审核中英文翻译包，防止偷工减料或结构断裂。 | `outputDir` (项目输出目录), `write` (默认 false) |
| **`integrity_audit`** | `integrity_audit.py` | PaperSpine 品控大检，评估 Blueprint、引用储备库和修改矩阵的齐备度。 | `outputDir`, `write`, `json` |
| **`word_guard`** | `word_guard.py` | 精确审计生成的 .docx 文本字数、防止 mojibake（乱码）。 | `paths` (docx路径) |
| **`structured_review`** | `structured_review.py` | 模拟学术同行双盲审稿，输出教导式的审稿意见并附带具体修改命令。 | `outputDir`, `write` |

---

## 4. 本地诊断快捷命令示例

如果你希望在命令行中直接运行调试，可以在 `F:\fcpaper\PaperSpine` 下运行：

```powershell
# 1. 运行文本写作风格分析
py src/scripts/style_metrics.py F:\fcpaper\PaperSpine\README.md --markdown

# 2. 对输出结果执行完整性审计
py src/scripts/integrity_audit.py F:\fcpaper\paper_rewriting_output --markdown --write

# 3. 运行中英文翻译完整度检验
py src/scripts/translate_guard.py F:\fcpaper\paper_rewriting_output --markdown --write
```

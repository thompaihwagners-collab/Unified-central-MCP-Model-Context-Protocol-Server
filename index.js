import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Define unified central MCP server
const server = new Server(
  {
    name: 'my-unified-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Constants
const PPT_MASTER_PATH = 'C:\\Users\\Lenovo\\.claude\\skills\\ppt-master';
const NATURE_SKILLS_PATH = 'F:\\fcpaper\\nature-skills';
const PAPER_SPINE_PATH = 'F:\\fcpaper\\PaperSpine';
const MY_UNIFIED_MCP_PATH = 'F:\\my-unified-mcp';

/**
 * Helper to execute a Python script and capture its stdout/stderr
 */
function executePython(scriptPath, args, cwd) {
  return new Promise((resolve) => {
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    console.error(`[MCP Log] Executing Python: ${pyCmd} ${scriptPath} ${args.join(' ')} (CWD: ${cwd})`);
    
    const child = spawn(pyCmd, [scriptPath, ...args], { cwd });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
    
    child.on('error', (err) => {
      resolve({
        success: false,
        code: -1,
        stdout: stdout.trim(),
        stderr: (err.message + '\n' + stderr).trim()
      });
    });
  });
}

/**
 * Emulates the nature-polishing dynamic prompt router layer
 */
function handlePolishRouter(args) {
  const polishingDir = path.join(NATURE_SKILLS_PATH, 'skills', 'nature-polishing');
  const manifestPath = path.join(polishingDir, 'manifest.yaml');
  
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`nature-polishing manifest.yaml not found at: ${manifestPath}`);
  }
  
  // 1. Read and parse manifest
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifest = yaml.load(manifestContent);
  
  // 2. Resolve axis values
  const paperType = args.paperType || manifest.axes.paper_type.default || 'research';
  const section = args.section; // Could be a string like "abstract" or comma-separated "abstract,intro"
  const language = args.language || manifest.axes.language.default || 'en';
  const journal = args.journal || manifest.axes.journal.default || 'generic';
  
  // 3. Load all fragments
  const loadedFragments = [];
  
  // A. Load "always_load" files (resolved relative to manifestDir)
  if (manifest.always_load) {
    for (const relativePath of manifest.always_load) {
      const fullPath = path.resolve(polishingDir, relativePath);
      if (fs.existsSync(fullPath)) {
        loadedFragments.push({
          source: `always_load: ${relativePath}`,
          content: fs.readFileSync(fullPath, 'utf8')
        });
      } else {
        console.error(`[Warning] Could not find always_load file: ${fullPath}`);
      }
    }
  }
  
  // B. Load paper_type fragment
  const paperTypeRelPath = manifest.axes.paper_type.values[paperType];
  if (paperTypeRelPath) {
    const fullPath = path.resolve(polishingDir, paperTypeRelPath);
    if (fs.existsSync(fullPath)) {
      loadedFragments.push({
        source: `paper_type (${paperType}): ${paperTypeRelPath}`,
        content: fs.readFileSync(fullPath, 'utf8')
      });
    }
  }
  
  // C. Load section fragment(s)
  if (section) {
    const sectionsToLoad = section.split(',').map(s => s.trim());
    for (const sec of sectionsToLoad) {
      const sectionRelPath = manifest.axes.section.values[sec];
      if (sectionRelPath) {
        const fullPath = path.resolve(polishingDir, sectionRelPath);
        if (fs.existsSync(fullPath)) {
          loadedFragments.push({
            source: `section (${sec}): ${sectionRelPath}`,
            content: fs.readFileSync(fullPath, 'utf8')
          });
        }
      }
    }
  }
  
  // D. Load language fragment
  const languageRelPath = manifest.axes.language.values[language];
  if (languageRelPath) {
    const fullPath = path.resolve(polishingDir, languageRelPath);
    if (fs.existsSync(fullPath)) {
      loadedFragments.push({
        source: `language (${language}): ${languageRelPath}`,
        content: fs.readFileSync(fullPath, 'utf8')
      });
    }
  }
  
  // E. Load journal fragment
  const journalRelPath = manifest.axes.journal.values[journal];
  if (journalRelPath) {
    const fullPath = path.resolve(polishingDir, journalRelPath);
    if (fs.existsSync(fullPath)) {
      loadedFragments.push({
        source: `journal (${journal}): ${journalRelPath}`,
        content: fs.readFileSync(fullPath, 'utf8')
      });
    }
  }
  
  // F. Load references on demand if requested
  const reqRefs = args.references || [];
  if (reqRefs.length > 0 && manifest.references && manifest.references.on_demand) {
    for (const refObj of manifest.references.on_demand) {
      const filename = path.basename(refObj.path, '.md');
      if (reqRefs.includes(filename) || reqRefs.includes('all')) {
        const fullPath = path.resolve(polishingDir, refObj.path);
        if (fs.existsSync(fullPath)) {
          loadedFragments.push({
            source: `reference: ${refObj.path} (${refObj.condition})`,
            content: fs.readFileSync(fullPath, 'utf8')
          });
        }
      }
    }
  }
  
  // 4. Assemble the dynamic polishing context
  let guide = `# Nature-Style Polishing Guidance Context\n`;
  guide += `Generated: ${new Date().toISOString()}\n`;
  guide += `Configuration Axes:\n`;
  guide += `- Paper Type: ${paperType}\n`;
  guide += `- Section(s): ${section || 'None specified (Prose/Draft Polishing)'}\n`;
  guide += `- Language Stance: ${language}\n`;
  guide += `- Target Journal: ${journal}\n\n`;
  
  guide += `========================================================================\n`;
  guide += `ACTIVATE CORE SCIENTIFIC WRITING FRAGMENTS\n`;
  guide += `========================================================================\n\n`;
  
  for (const frag of loadedFragments) {
    guide += `--- Fragment Source: ${frag.source} ---\n`;
    guide += `${frag.content}\n\n`;
  }
  
  if (args.text) {
    guide += `========================================================================\n`;
    guide += `ORIGINAL MANUSCRIPT TEXT TO POLISH\n`;
    guide += `========================================================================\n\n`;
    guide += `${args.text}\n\n`;
  }
  
  return {
    axes: { paperType, section, language, journal },
    guide: guide.trim(),
    totalFragmentsLoaded: loadedFragments.length
  };
}

// ---------------------------------------------------------------------------
// 1. List Available Tools
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_ppt',
        description: '演示文稿 (PPT) 生成与后处理核心工具 (基于 ppt-master 技能)。提供 PDF/DOCX/Excel/网页文档转换、项目目录初始化、Markdown 内容分节、SVG 页面精细化美化与最终 PPTX 的自动导出全套流程。',
        inputSchema: {
          type: 'object',
          properties: {
            step: {
              type: 'string',
              description: '执行的具体 pipeline 步骤：\n' +
                '- "pdf_to_md": 转换 PDF 为 Markdown\n' +
                '- "ppt_to_md": 转换 PPT 为 Markdown\n' +
                '- "doc_to_md": 转换 Word/HTML 等为 Markdown\n' +
                '- "excel_to_md": 转换 Excel 为 Markdown\n' +
                '- "web_to_md": 转换网页 URL 为 Markdown\n' +
                '- "init": 初始化 PPT 项目文件夹\n' +
                '- "import_sources": 移动导入源文件到项目 sources 目录下\n' +
                '- "validate": 校验项目状态与结构是否正常\n' +
                '- "split": 自动对 Markdown 源文件做分节处理并生成演讲备注\n' +
                '- "finalize": 执行 SVG 文件的后处理与美化工作\n' +
                '- "export": 转换美化后的 SVG 页面为 PPTX 演示文稿文件\n' +
                '- "run_pipeline": 自动化执行端到端完整生成流程 (init -> import -> split -> finalize -> export)',
              enum: [
                'pdf_to_md', 'ppt_to_md', 'doc_to_md', 'excel_to_md', 'web_to_md',
                'init', 'import_sources', 'validate', 'split', 'finalize', 'export', 'run_pipeline'
              ]
            },
            projectPath: {
              type: 'string',
              description: '演示项目文件夹的绝对路径 (如 F:\\my-unified-mcp\\scratch\\my-deck)'
            },
            projectName: {
              type: 'string',
              description: '项目名称 (仅在 init / run_pipeline 步骤使用，会在对应目录新建同名目录)'
            },
            format: {
              type: 'string',
              description: '画布尺寸格式。可选：ppt169 (默认宽屏), ppt43 (普屏), xhs (小红书卡片), story等。',
              default: 'ppt169'
            },
            sourceFiles: {
              type: 'array',
              items: { type: 'string' },
              description: '需要转换或导入的项目源文件绝对路径列表。'
            },
            url: {
              type: 'string',
              description: '网页 URL 链接 (仅在 web_to_md 时使用)'
            },
            outputFile: {
              type: 'string',
              description: '可选。导出最终 PPTX 的绝对路径。如果不传，默认保存在项目的 export/ 目录下。'
            }
          },
          required: ['step']
        }
      },
      {
        name: 'nature_analysis',
        description: 'Nature 级别学术文章写作、润色与学术搜索中央技能工具 (基于 nature-skills)。支持多源文献检索、精确引用匹配、EndNote/RIS引文格式导出，以及根据当前论文章节和类型，动态装载 Nature 顶刊级别的段落大纲逻辑、学术语气和 phrasebank 经典替换句式建议。',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: '具体执行的文章分析或润色动作：\n' +
                '- "citation": 提取正文草稿，多源并发检索严格 CNS (Cell/Nature/Science) 期刊范围的引用候选，并输出 RIS/EndNote 等文献库文件。\n' +
                '- "polish_router": 针对论文章节段落、体裁，动态装载 Nature 级别段落结构、学术语气、失败模式警示和 phrasebank 替换句式指引。\n' +
                '- "search_papers": 并发多源学术文献检索 (Crossref, Pubmed, Arxiv 并发合并去重)。\n' +
                '- "get_paper_by_id": 依据 ID 精准获取单篇文献详细元数据 (支持 DOI / PMID / arXiv ID 智能自适应识别)。\n' +
                '- "convert_citation": 依据 PMID/DOI/arXiv ID 匹配引文并直接下载为特定文件格式 (.nbib / .ris / .bib / .enw)。\n' +
                '- "lookup_mesh": 检索医学 MeSH 词表词项，用以高精度构建 PubMed 检索式。',
              enum: ['citation', 'polish_router', 'search_papers', 'get_paper_by_id', 'convert_citation', 'lookup_mesh']
            },
            text: {
              type: 'string',
              description: '待润色的论文正文段落，或需要检索引用的稿件片段 (用于 citation / polish_router)。'
            },
            claim: {
              type: 'string',
              description: '单条需要文献佐证的学术声明 (用于 citation)。'
            },
            doi: {
              type: 'string',
              description: '特定文献的 DOI 标识符 (用于 citation / get_paper_by_id / convert_citation)。'
            },
            id: {
              type: 'string',
              description: '精准文献 ID，可以是 DOI、PMID 或 arXiv ID (用于 get_paper_by_id / convert_citation)。'
            },
            idType: {
              type: 'string',
              description: '强制的文献 ID 类型。可选：auto (智能识别，默认), doi, pmid, arxiv。',
              default: 'auto'
            },
            outputFile: {
              type: 'string',
              description: '文献引文列表导出绝对路径 (如 F:\\my-unified-mcp\\paper.enw，用于 citation / convert_citation)。'
            },
            format: {
              type: 'string',
              description: '引文格式。可选：enw (默认), ris, zotero-rdf, bib等。',
              default: 'enw'
            },
            scope: {
              type: 'string',
              description: '引文检索匹配的期刊库范围。可选：cns (CNS顶刊，默认), nature (Nature系列), science, cell, flagship。',
              default: 'cns'
            },
            paperType: {
              type: 'string',
              description: '论文体裁类型，用来定制写作大纲指引。可选：research (默认), methods, hypothesis, algorithmic, review。',
              default: 'research'
            },
            section: {
              type: 'string',
              description: '当前润色的具体章节，用以匹配特定段落的写作 Move Models 与警示。可选：abstract, intro, results, discussion, conclusion, title, methods。'
            },
            language: {
              type: 'string',
              description: '稿件原语言 stance。可选：en (英文草稿，默认), zh-to-en (中文草稿翻译与美化)。',
              default: 'en'
            },
            journal: {
              type: 'string',
              description: '目标投稿期刊。可选：generic (通用，默认), nature (Nature 正刊及大子刊), nat-comms (Nature Communications)。',
              default: 'generic'
            },
            query: {
              type: 'string',
              description: '文献检索查询关键字 (用于 search_papers / convert_citation)。'
            },
            term: {
              type: 'string',
              description: 'MeSH 查询词项 (用于 lookup_mesh)。'
            },
            rows: {
              type: 'integer',
              description: '每个搜索引擎返回的文献行数上限 (用于 search_papers，默认 5，最大 50)。',
              default: 5
            },
            references: {
              type: 'array',
              items: { type: 'string' },
              description: '按需加载的额外参考手册。可选值：published-article-patterns, section-moves, phrasebank-playbook, style-guardrails, writing-strategy, all。'
            }
          },
          required: ['action']
        }
      },
      {
        name: 'paperspine_analysis',
        description: '学术论文全生命周期写作、诊断与 LaTeX 安全验证核心工具 (基于 PaperSpine)。包含论文写作风格统计分析、LaTeX 语法与结构验证、中英文翻译完整度检验、论文项目完整性诊断、段落字数控制等强大功能。',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: '执行的具体学术诊断或验证动作：\n' +
                '- "style_metrics": 计算学术论文的写作风格指标 (包括字数、句长、高频学术词汇、起承转合连接词以及引用密度等)。\n' +
                '- "latex_guard": 扫描 LaTeX 稿件 (验证括号是否匹配、合并冲突标记、文件与环境完整性、未定义引用与标签等)。\n' +
                '- "translate_guard": 审核中英文对照翻译包的完整性 (检测文件遗漏、大表格结构破坏、内容字数密度不匹配及 manifest 偏差)。\n' +
                '- "integrity_audit": 完整的 PaperSpine 写作质量大纲自检 (审核大纲 blueprint、写作 rationale matrix 完备度、引用储备库质量等)。\n' +
                '- "word_guard": 段落与章节的字数硬性限制与多寡预警校验。\n' +
                '- "citation_bank_check": 校验 citation support bank 引用储备库的结构与完备度。\n' +
                '- "citation_quality_audit": 针对 citation support bank 引用储备库的年代、主题及引用质量进行精细化评估。\n' +
                '- "artifact_check": 校验论文输出目录下的中间过程文件与最终成果是否均已妥善生成并对齐格式。\n' +
                '- "revision_audit": 检查论文在评审后的修改过程是否与 rationale matrix 冲突。\n' +
                '- "structured_review": 仿真学术同行评审，输出教导式的审稿意见并指出具体的修改操作建议。',
              enum: [
                'style_metrics', 'latex_guard', 'translate_guard', 'integrity_audit',
                'word_guard', 'citation_bank_check', 'citation_quality_audit',
                'artifact_check', 'revision_audit', 'structured_review'
              ]
            },
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: '待分析的 LaTeX/Markdown 文本文件或目录路径列表 (用于 style_metrics, latex_guard)。'
            },
            outputDir: {
              type: 'string',
              description: 'PaperSpine 的项目输出目录路径 (如 F:\\fcpaper\\paper_rewriting_output，默认为当前目录或 "paper_rewriting_output")。'
            },
            json: {
              type: 'boolean',
              description: '是否直接返回精简的 JSON 结构化数据。若为 false 则返回经过格式化排版的 Markdown 报告。',
              default: true
            },
            write: {
              type: 'boolean',
              description: '是否将生成的审计报告直接写入对应的项目输出目录下 (例如保存为 integrity_audit.md 或 translate_guard_report.md)。',
              default: false
            }
          },
          required: ['action']
        }
      }
    ]
  };
});

// ---------------------------------------------------------------------------
// 2. Call Tools Request Handler
// ---------------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  console.error(`[MCP Log] CallTool called: ${name} with args:`, JSON.stringify(toolArgs));
  
  try {
    // =======================================================================
    // Tool 1: generate_ppt (ppt-master)
    // =======================================================================
    if (name === 'generate_ppt') {
      const step = toolArgs.step;
      const projectPath = toolArgs.projectPath;
      const sourceFiles = toolArgs.sourceFiles || [];
      const format = toolArgs.format || 'ppt169';
      const url = toolArgs.url;
      const outputFile = toolArgs.outputFile;
      
      const scriptsDir = path.join(PPT_MASTER_PATH, 'scripts');
      
      // Determine CWD and name for initialization
      let targetCwd = PPT_MASTER_PATH;
      let projName = toolArgs.projectName || 'default_deck';
      if (projectPath) {
        targetCwd = path.dirname(projectPath);
        projName = path.basename(projectPath);
      }
      
      switch (step) {
        case 'pdf_to_md': {
          if (sourceFiles.length === 0) throw new Error('pdf_to_md requires at least one source file in sourceFiles');
          const script = path.join(scriptsDir, 'source_to_md', 'pdf_to_md.py');
          const res = await executePython(script, [sourceFiles[0]], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Conversion successful:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        case 'ppt_to_md': {
          if (sourceFiles.length === 0) throw new Error('ppt_to_md requires at least one source file in sourceFiles');
          const script = path.join(scriptsDir, 'source_to_md', 'ppt_to_md.py');
          const res = await executePython(script, [sourceFiles[0]], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Conversion successful:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        case 'doc_to_md': {
          if (sourceFiles.length === 0) throw new Error('doc_to_md requires at least one source file in sourceFiles');
          const script = path.join(scriptsDir, 'source_to_md', 'doc_to_md.py');
          const res = await executePython(script, [sourceFiles[0]], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Conversion successful:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        case 'excel_to_md': {
          if (sourceFiles.length === 0) throw new Error('excel_to_md requires at least one source file in sourceFiles');
          const script = path.join(scriptsDir, 'source_to_md', 'excel_to_md.py');
          const res = await executePython(script, [sourceFiles[0]], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Conversion successful:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        case 'web_to_md': {
          if (!url) throw new Error('web_to_md requires URL parameter');
          const script = path.join(scriptsDir, 'source_to_md', 'web_to_md.py');
          const res = await executePython(script, [url], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Conversion successful:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        case 'init': {
          const script = path.join(scriptsDir, 'project_manager.py');
          const res = await executePython(script, ['init', projName, '--format', format], targetCwd);
          return { content: [{ type: 'text', text: res.success ? `Project initialized successfully:\n${res.stdout}` : `Initialization failed:\n${res.stderr}` }] };
        }
        
        case 'import_sources': {
          if (!projectPath) throw new Error('import_sources requires projectPath');
          if (sourceFiles.length === 0) throw new Error('import_sources requires at least one file in sourceFiles');
          const script = path.join(scriptsDir, 'project_manager.py');
          const res = await executePython(script, ['import-sources', projectPath, ...sourceFiles, '--move'], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Sources imported successfully:\n${res.stdout}` : `Import failed:\n${res.stderr}` }] };
        }
        
        case 'validate': {
          if (!projectPath) throw new Error('validate requires projectPath');
          const script = path.join(scriptsDir, 'project_manager.py');
          const res = await executePython(script, ['validate', projectPath], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Validation report:\n${res.stdout}` : `Validation failed:\n${res.stderr}` }] };
        }
        
        case 'split': {
          if (!projectPath) throw new Error('split requires projectPath');
          const script = path.join(scriptsDir, 'total_md_split.py');
          const res = await executePython(script, [projectPath], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `Split completed successfully:\n${res.stdout}` : `Split failed:\n${res.stderr}` }] };
        }
        
        case 'finalize': {
          if (!projectPath) throw new Error('finalize requires projectPath');
          const script = path.join(scriptsDir, 'finalize_svg.py');
          const res = await executePython(script, [projectPath], PPT_MASTER_PATH);
          return { content: [{ type: 'text', text: res.success ? `SVG Post-processing successful:\n${res.stdout}` : `Post-processing failed:\n${res.stderr}` }] };
        }
        
        case 'export': {
          if (!projectPath) throw new Error('export requires projectPath');
          const script = path.join(scriptsDir, 'svg_to_pptx.py');
          const res = await executePython(script, [projectPath], PPT_MASTER_PATH);
          
          let copyMsg = '';
          if (res.success && outputFile) {
            const exportDir = path.join(projectPath, 'export');
            if (fs.existsSync(exportDir)) {
              const files = fs.readdirSync(exportDir);
              const pptxFile = files.find(f => f.endsWith('.pptx'));
              if (pptxFile) {
                const srcPath = path.join(exportDir, pptxFile);
                fs.copyFileSync(srcPath, outputFile);
                copyMsg = `\nCopied final PPTX to: ${outputFile}`;
              }
            }
          }
          return { content: [{ type: 'text', text: res.success ? `Exported to PPTX successfully:\n${res.stdout}${copyMsg}` : `Export failed:\n${res.stderr}` }] };
        }
        
        case 'run_pipeline': {
          if (!projectPath) throw new Error('run_pipeline requires projectPath');
          
          console.error(`[MCP Pipeline] Starting automated deck pipeline for: ${projName}`);
          
          // 1. Init
          const scriptPM = path.join(scriptsDir, 'project_manager.py');
          const initRes = await executePython(scriptPM, ['init', projName, '--format', format], targetCwd);
          if (!initRes.success) {
            return { content: [{ type: 'text', text: `Pipeline failed at initialization stage:\n${initRes.stderr}` }] };
          }
          
          // 2. Import Sources (Optional, if files are provided)
          if (sourceFiles.length > 0) {
            const importRes = await executePython(scriptPM, ['import-sources', projectPath, ...sourceFiles, '--move'], PPT_MASTER_PATH);
            if (!importRes.success) {
              return { content: [{ type: 'text', text: `Pipeline failed at importing sources stage:\n${importRes.stderr}` }] };
            }
          }
          
          // 3. Split Markdown
          const scriptSplit = path.join(scriptsDir, 'total_md_split.py');
          const splitRes = await executePython(scriptSplit, [projectPath], PPT_MASTER_PATH);
          if (!splitRes.success) {
            return { content: [{ type: 'text', text: `Pipeline failed at Markdown split/notes stage:\n${splitRes.stderr}` }] };
          }
          
          // 4. SVG Finalize / Beautification
          const scriptFinalize = path.join(scriptsDir, 'finalize_svg.py');
          const finalizeRes = await executePython(scriptFinalize, [projectPath], PPT_MASTER_PATH);
          if (!finalizeRes.success) {
            return { content: [{ type: 'text', text: `Pipeline failed at SVG finalize stage:\n${finalizeRes.stderr}` }] };
          }
          
          // 5. SVG to PPTX Export
          const scriptExport = path.join(scriptsDir, 'svg_to_pptx.py');
          const exportRes = await executePython(scriptExport, [projectPath], PPT_MASTER_PATH);
          if (!exportRes.success) {
            return { content: [{ type: 'text', text: `Pipeline failed at PPTX export stage:\n${exportRes.stderr}` }] };
          }
          
          // 6. Copy output
          let copyMsg = '';
          if (outputFile) {
            const exportDir = path.join(projectPath, 'export');
            if (fs.existsSync(exportDir)) {
              const files = fs.readdirSync(exportDir);
              const pptxFile = files.find(f => f.endsWith('.pptx'));
              if (pptxFile) {
                const srcPath = path.join(exportDir, pptxFile);
                fs.copyFileSync(srcPath, outputFile);
                copyMsg = `\n[Success] Copied final PPTX deck directly to: ${outputFile}`;
              }
            }
          }
          
          return {
            content: [{
              type: 'text',
              text: `=== PPT Master Automated Pipeline Complete ===\n` +
                `Project Location: ${projectPath}\n` +
                `Format: ${format}\n` +
                `Source Files: ${sourceFiles.join(', ') || 'Direct Prompt Context'}\n` +
                `Logs summary:\n${exportRes.stdout}${copyMsg}`
            }]
          };
        }
        
        default:
          throw new Error(`Unsupported step: ${step}`);
      }
    }
    
    // =======================================================================
    // Tool 2: nature_analysis (nature-skills)
    // =======================================================================
    if (name === 'nature_analysis') {
      const action = toolArgs.action;
      
      switch (action) {
        case 'citation': {
          const script = path.join(NATURE_SKILLS_PATH, 'skills', 'nature-citation', 'scripts', 'nature_citation.py');
          const pyArgs = [];
          if (toolArgs.text) pyArgs.push('--text', toolArgs.text);
          if (toolArgs.claim) pyArgs.push('--claim', toolArgs.claim);
          if (toolArgs.doi) pyArgs.push('--doi', toolArgs.doi);
          if (toolArgs.outputFile) pyArgs.push('--output-file', toolArgs.outputFile);
          if (toolArgs.format) pyArgs.push('--format', toolArgs.format);
          if (toolArgs.scope) pyArgs.push('--scope', toolArgs.scope);
          
          if (pyArgs.length === 0) throw new Error('citation requires either text, claim, or doi input parameters');
          
          const res = await executePython(script, pyArgs, NATURE_SKILLS_PATH);
          return { content: [{ type: 'text', text: res.success ? `Citation candidates fetched successfully:\n${res.stdout}` : `Citation generation failed:\n${res.stderr}` }] };
        }
        
        case 'polish_router': {
          const resObj = handlePolishRouter(toolArgs);
          return { content: [{ type: 'text', text: JSON.stringify(resObj, null, 2) }] };
        }
        
        case 'search_papers': {
          if (!toolArgs.query) throw new Error('search_papers action requires the query keyword parameter');
          const script = path.join(MY_UNIFIED_MCP_PATH, 'academic_search_helper.py');
          const pyArgs = [
            '--action', 'search_papers',
            '--query', toolArgs.query,
            '--rows', (toolArgs.rows || 5).toString()
          ];
          if (toolArgs.sources) pyArgs.push('--sources', toolArgs.sources);
          
          const res = await executePython(script, pyArgs, MY_UNIFIED_MCP_PATH);
          return { content: [{ type: 'text', text: res.success ? res.stdout : `Academic search failed:\n${res.stderr}` }] };
        }
        
        case 'get_paper_by_id': {
          const paperId = toolArgs.id || toolArgs.doi;
          if (!paperId) throw new Error('get_paper_by_id action requires id (or doi) parameter');
          const script = path.join(MY_UNIFIED_MCP_PATH, 'academic_search_helper.py');
          const pyArgs = [
            '--action', 'get_paper_by_id',
            '--id', paperId,
            '--id-type', toolArgs.idType || 'auto'
          ];
          
          const res = await executePython(script, pyArgs, MY_UNIFIED_MCP_PATH);
          return { content: [{ type: 'text', text: res.success ? res.stdout : `Details fetch failed:\n${res.stderr}` }] };
        }
        
        case 'lookup_mesh': {
          const term = toolArgs.term || toolArgs.query;
          if (!term) throw new Error('lookup_mesh action requires term parameter');
          const script = path.join(MY_UNIFIED_MCP_PATH, 'academic_search_helper.py');
          const pyArgs = [
            '--action', 'lookup_mesh',
            '--term', term
          ];
          
          const res = await executePython(script, pyArgs, MY_UNIFIED_MCP_PATH);
          return { content: [{ type: 'text', text: res.success ? res.stdout : `MeSH search failed:\n${res.stderr}` }] };
        }
        
        case 'convert_citation': {
          const converterScript = path.join(NATURE_SKILLS_PATH, 'skills', 'nature-academic-search', 'scripts', 'format-converter.py');
          const converterCwd = path.dirname(converterScript);
          const pyArgs = [];
          
          const paperId = toolArgs.id || toolArgs.doi;
          if (paperId) {
            if (paperId.startsWith('10.')) {
              pyArgs.push('--doi', paperId);
            } else if (/^\d{7,8}$/.test(paperId)) {
              pyArgs.push('--pmid', paperId);
            } else {
              pyArgs.push('--arxiv', paperId);
            }
          } else if (toolArgs.query) {
            pyArgs.push('--query', toolArgs.query);
          } else {
            throw new Error('convert_citation requires id, doi, or query parameter');
          }
          
          pyArgs.push('--format', toolArgs.format || 'ris');
          
          const res = await executePython(converterScript, pyArgs, converterCwd);
          return { content: [{ type: 'text', text: res.success ? `Conversion details:\n${res.stdout}` : `Conversion failed:\n${res.stderr}` }] };
        }
        
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    }
    
    // =======================================================================
    // Tool 3: paperspine_analysis (PaperSpine)
    // =======================================================================
    if (name === 'paperspine_analysis') {
      const action = toolArgs.action;
      const scriptsDir = path.join(PAPER_SPINE_PATH, 'src', 'scripts');
      const outputDir = toolArgs.outputDir || 'paper_rewriting_output';
      
      const pyArgs = [];
      let scriptName = '';
      let targetCwd = PAPER_SPINE_PATH;
      
      switch (action) {
        case 'style_metrics': {
          scriptName = 'style_metrics.py';
          const paths = toolArgs.paths || ['.'];
          pyArgs.push(...paths);
          if (toolArgs.json !== false) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          break;
        }
        case 'latex_guard': {
          scriptName = 'latex_guard.py';
          const paths = toolArgs.paths || [];
          if (paths.length === 0) {
            throw new Error('latex_guard action requires at least one .tex file path in paths parameter');
          }
          pyArgs.push(paths[0]); // main tex file
          if (paths.length > 1 && paths[1].endsWith('.bib')) {
            pyArgs.push('--bib', paths[1]);
          } else {
            // Auto detect .bib file in the same directory as .tex file
            const texDir = path.dirname(paths[0]);
            if (fs.existsSync(texDir)) {
              const files = fs.readdirSync(texDir);
              const bibFile = files.find(f => f.endsWith('.bib'));
              if (bibFile) {
                pyArgs.push('--bib', path.join(texDir, bibFile));
              }
            }
          }
          if (toolArgs.json) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          break;
        }
        case 'translate_guard': {
          scriptName = 'translate_guard.py';
          pyArgs.push(outputDir);
          if (toolArgs.json !== false) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          if (toolArgs.write) pyArgs.push('--write');
          break;
        }
        case 'integrity_audit': {
          scriptName = 'integrity_audit.py';
          pyArgs.push(outputDir);
          if (toolArgs.json !== false) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          if (toolArgs.write) pyArgs.push('--write');
          break;
        }
        case 'word_guard': {
          scriptName = 'word_guard.py';
          const paths = toolArgs.paths || [];
          let docxPath = '';
          if (paths.length > 0) {
            docxPath = paths[0];
          } else {
            // Auto detect docx in outputDir
            if (fs.existsSync(outputDir)) {
              const files = fs.readdirSync(outputDir);
              const foundDocx = files.find(f => f.endsWith('.docx'));
              if (foundDocx) {
                docxPath = path.join(outputDir, foundDocx);
              }
            }
          }
          if (!docxPath) {
            throw new Error('word_guard action requires a .docx file path, and none was found in outputDir');
          }
          pyArgs.push(docxPath);
          if (toolArgs.json !== false) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          break;
        }
        case 'citation_bank_check': {
          scriptName = 'citation_bank_check.py';
          pyArgs.push('--dir', outputDir);
          break;
        }
        case 'citation_quality_audit': {
          scriptName = 'citation_quality_audit.py';
          pyArgs.push('--dir', outputDir);
          break;
        }
        case 'artifact_check': {
          scriptName = 'artifact_check.py';
          pyArgs.push('--dir', outputDir);
          break;
        }
        case 'revision_audit': {
          scriptName = 'revision_audit.py';
          pyArgs.push('--dir', outputDir);
          break;
        }
        case 'structured_review': {
          scriptName = 'structured_review.py';
          pyArgs.push(outputDir);
          if (toolArgs.json !== false) pyArgs.push('--json');
          else pyArgs.push('--markdown');
          if (toolArgs.write) pyArgs.push('--write');
          break;
        }
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
      
      const scriptFullPath = path.join(scriptsDir, scriptName);
      const res = await executePython(scriptFullPath, pyArgs, targetCwd);
      
      return {
        content: [{
          type: 'text',
          text: res.success ? res.stdout : `PaperSpine execution failed:\n${res.stderr}`
        }]
      };
    }
    
    throw new Error(`Tool not found: ${name}`);
  } catch (err) {
    console.error(`[MCP Error] Tool execution failed: ${err.message}`);
    return {
      isError: true,
      content: [{ type: 'text', text: `Tool error: ${err.message}` }]
    };
  }
});

// ---------------------------------------------------------------------------
// 3. Connect Server with Stdio Transport
// ---------------------------------------------------------------------------
async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Info] Unified central MCP server running on stdio');
}

startServer().catch((err) => {
  console.error('[MCP Fatal] Unified MCP server crashed:', err);
  process.exit(1);
});

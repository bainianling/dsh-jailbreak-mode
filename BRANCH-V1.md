# 分支说明：`v1` —— 渗透型破甲分支

> 本文是 **`v1` 分支的分支描述**。GitHub 的分支对象没有 description 字段（REST API 的
> `PATCH /repos/{owner}/{repo}/branches/{branch}` 返回 404），因此分支定位以仓库内文档承载，
> 并在 `README.md` 顶部挂横幅指向本文。

| 项 | 值 |
|----|----|
| 分支 | `v1` |
| 定位 | **渗透型破甲分支（Penetration-oriented jailbreak branch）** |
| HEAD | `8b61ba5` — `feat(aimy): bundle the aimy-skill toolkit behind a new jailbreak strategy` |
| 基线 | 从 `master`（`a73b34e`）切出 |
| 版本 | `@bainianling/dsh-jailbreak-mode@0.1.0-rc.14` |
| 变更规模 | 453 个文件，+119,207 / −12 |
| 上游 | <https://github.com/bainianling/dsh-jailbreak-mode/tree/v1> |

## 一句话定位

`v1` 在 `master` 的通用破甲框架之上，把**一整套真实可运行的渗透测试工具链（aimy-skill v3.7.0）
整包内置**到插件里，并新增对应策略 `aimy-skill`：破甲侧负责把模型放进"已获授权的安全测试"语境、
要求证据先行；技能侧提供 102 篇攻击方法论提示词与 136 个可调用的 Python 工具模块。两者组合成
**渗透型破甲**——不是让模型"无限制地聊安全"，而是让它按真实工具链、按证据标签干活。

---

## 一、破甲（jailbreak）部分

### 1.1 插件与工作机制

插件 `@bainianling/dsh-jailbreak-mode` 是挂在 DeepSeek Harness（基于 Cordis 的插件化 Agent
harness）上的**独立第三方**插件。它不改动宿主代码，只在**激活时改写送往模型的输入**：

| 通道 | 行为 | 提示词序位 |
|------|------|-----------|
| 系统提示词 | 追加所选策略的指令块（`jailbreak:policy`） | 130 |
| 用户消息 | 被"认领"的消息在到达模型前用策略的 `prefix` / `suffix` 包装 | — |
| 状态记录 | 以 `jailbreak/mode` 事件写入会话日志 | 可回放 / 恢复 / fork |

- **按 agent 记录**：状态属于会话/agent 自身，fork 出的 agent 继承已记录状态，新生成的 agent
  默认未激活。
- **只改写提示词**：不绕过沙箱、不绕过审批策略、不移除模型服务商一侧的内容审核。
- **可组合**：`/jailbreak evaluator+reverse-engineering` 以 `+` 组合多个策略；系统块与前缀按列出
  顺序展开，后缀逆序收束，组合结果确定。

### 1.2 命令

| 命令 | 作用 |
|------|------|
| `/jailbreak` | 以当前策略进入破甲模式 |
| `/jailbreak off` | 退出破甲模式 |
| `/jailbreak <strategy>` | 切换到指定策略（未知 id 明确报错，不静默降级） |
| `/jailbreak <a>+<b>` | 组合策略 |
| `/jailbreak aimy-skill` | **启用内置 AIMY 渗透工具链（本分支的默认推荐入口）** |

### 1.3 配置项

| 配置 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `defaultActive` | boolean | `false` | 新建 agent 是否免命令直接进入破甲模式（会话自身已记录状态优先） |
| `defaultStrategy` | string | 全局默认 | `defaultActive` 生效时采用的策略 id；未知 id 在插件加载期失败 |
| `workspaceSubdir` | string | `tvd` | TVD 工作区在会话 cwd 下的子目录（仅 `tvd-guard` 使用） |
| `validatorModel` | string | 空 | 写入 TVD 文件的分类模型名；为空则降级为纯提示词变体 |

渗透场景推荐配置：

```yaml
- id: jailbreak-mode
  name: '@bainianling/dsh-jailbreak-mode'
  config:
    defaultActive: true
    defaultStrategy: aimy-skill   # 直接启用内置渗透工具链
```

### 1.4 内置策略全表（共 14 种）

`BUILTIN_STRATEGY_COUNT` 由 `JAILBREAK_STRATEGIES.length` 导出，UI 文案请读该常量而非硬编码。

| id | 类别 | 风险 | 标签 | 消息包装 |
|----|------|------|------|----------|
| `dan` | persona | high | classic / roleplay | 包装 |
| `developer-mode` | prompt-injection | high | override | 包装 |
| `stan` | persona | high | classic / roleplay | 包装 |
| `prefix-injection` | prompt-injection | high | override | 包装 |
| `persona` | persona | high | roleplay | 包装 |
| `research-framing` | evaluation | high | framing | 包装 |
| `authorized-ctf` | evaluation | medium | security / ctf | 包装 |
| `authorized-game-research` | evaluation | high | security / games | 包装 |
| `evaluator` | evaluation | high | scoring | 不包装 |
| `continuation` | continuation | high | draft | 包装 |
| `gpt56-sol-unrestricted` | prompt-injection | high | executor | 不包装 |
| `reverse-engineering` | reverse-engineering | medium | static / dynamic / evidence | 包装 |
| **`aimy-skill`** | **security-toolkit** | **high** | **pentest / toolkit / bundled / claim-extraction** | **不包装** |
| `tvd-guard` | tool-loop | medium | validator / tvd | 不包装 |

其中 `reverse-engineering` 与 `aimy-skill` 是本分支的渗透相关主力：

- `reverse-engineering` 要求走完 **intake → static-map → decompile → data-flow → runtime-check →
  report** 六个阶段，结论必须标注 `VERIFIED` / `CANDIDATE` / `UNRESOLVED`，报告须含
  Findings / Evidence / Reproduction / Change / Verification / Rollback。
- `aimy-skill` 见下节。

### 1.5 两个"带资源"的策略

多数策略只携带提示词；有两个额外携带资源，且都**只渲染进 `jailbreak:policy` 系统块、不包装用户消息**：

| 策略 | 载体字段 | 渲染函数 | 资源 |
|------|----------|----------|------|
| `tvd-guard` | `strategy.tvd` | `renderTvdSystem`（`src/tvd.ts`） | 脚手架写入会话工作区，分类验证器真实运行 |
| `aimy-skill` | `strategy.aimy` | `renderAimySkillSystem`（`src/aimy.ts`） | 内置在包内的 aimy-skill 工具链，模型就地读取并运行 |

---

## 二、Skill（内置 aimy-skill 工具链）部分

### 2.1 来源与可核对性

| 项 | 值 |
|----|----|
| 上游 | [Prohao42/aimy-skill](https://github.com/Prohao42/aimy-skill) |
| 版本 | `3.7.0` |
| commit | `0c56eb161a10ce5fdea103cf8b92ced9a8f51e66` |
| 许可证 | MIT（副本见 `assets/aimy-skill/ai-mian/hack-skills/LICENSE`） |
| 内置位置 | `assets/aimy-skill/` |
| 内置规模 | **441 个文件、5.87 MB、逐字节副本**（不含 `.git`） |
| 一致性 | 441/441 个 blob 与上游 `git ls-tree -r HEAD` 的 SHA 完全一致 |

- 上游树**原样打包分发**，本插件未修改其任何文件。
- `.gitattributes` 对 `assets/aimy-skill/**` 关闭了 `text` / `eol` / `working-tree-encoding`
  转换——否则 Windows 上的 `core.autocrlf` 会把 426 个文件改写成 CRLF，一致性保证随即失效。
- 重新内置（升级上游）的步骤见 `STRATEGIES.md` 的 "Re-vendoring" 一节。

### 2.2 三块内容

```
assets/
├── aimy-skill-index.md        生成的索引（不手写计数）
└── aimy-skill/                上游逐字节副本（441 文件）
    ├── main.py                 CLI 入口：python main.py <command>
    ├── requirements.txt        requests / beautifulsoup4 / PyJWT / cryptography
    ├── tools/                  136 个 Python 工具模块（137 个 .py 去掉 __init__.py）
    ├── cli/                    3 个文件：arg_parsers / check_commands / …
    ├── engine/                 7 个文件：编排与工作流引擎
    ├── payload_seeds/          17 个按漏洞类别的 payload 种子
    ├── docs/                   9 份文档
    ├── data/                   运行数据
    ├── tests/                  63 个测试文件
    ├── lab_audit.py  lab_server.py
    └── ai-mian/hack-skills/    102 篇 Attack Skill 提示词
        ├── skills/<name>/SKILL.md  + 配套文档
        ├── site/  scripts/  assets/
        └── LICENSE  README.md  README_CN.md
```

### 2.3 Attack Skills：102 篇攻击方法论提示词

均为 `ai-mian/hack-skills/skills/<name>/SKILL.md`；**45 篇**附带配套文档
（`SCENARIOS.md` / `*_MATRIX.md` / `*_COOKBOOK.md` / `CHECKLIST.md` 等），按需加载。

入口是 `hack/SKILL.md`（P0 顶层路由），据此确定测试阶段，再进入下列 18 个分类：

| # | 分类 id | 名称 | 数量 |
|---|---------|------|------|
| 1 | `recon` | Reconnaissance & Methodology（信息收集 / 方法论 / 全局路由） | 3 |
| 2 | `api` | API Security（REST / GraphQL / 移动后端） | 5 |
| 3 | `auth` | Authentication & Authorization（认证 / 会话 / 授权 / 令牌） | 6 |
| 4 | `injection` | Injection Attacks（XSS / SQLi / SSRF / SSTI / 反序列化等） | 19 |
| 5 | `file` | File & Path Attacks（上传 / 下载 / LFI / 路径穿越） | 3 |
| 6 | `logic` | Business Logic & Session | 8 |
| 7 | `advweb` | Advanced Web Security | 10 |
| 8 | `infra` | Infrastructure & Network | 7 |
| 9 | `linux` | Linux & Container Security | 5 |
| 10 | `windows` | Windows & Active Directory | 7 |
| 11 | `macos` | macOS Security | 2 |
| 12 | `mobile` | Mobile Security | 3 |
| 13 | `pwn` | Binary Exploitation (Pwn) | 8 |
| 14 | `re` | Reverse Engineering | 4 |
| 15 | `crypto` | Cryptography Attacks | 5 |
| 16 | `blockchain` | Blockchain & Smart Contract | 2 |
| 17 | `ai` | AI/ML & LLM Security | 2 |
| 18 | `forensics` | Forensics & Steganography | 3 |
| | | **合计** | **102** |

分类归属由 `ai-mian/hack-skills/site/data/categories.yaml` 唯一确定（分类合计 102，与目录数一致）。

### 2.4 Python 工具模块：136 个

`tools/*.py` 每个模块导出可直接 import 的检查函数（多数为 `check(...)`），返回**结构化字典**，
便于脚本化编排与结果解析。覆盖面包含（按名前缀举例）：

- 注入类：`sqli_*`、`xss_*`、`cmdi_detector`、`ssti`、`nosqli_detector`、`crlf_injection`、
  `deserialization_detector` / `deser_weaponizer`、`xxe_*`
- 访问控制：`auth_bypass`、`auth_engine`、`auth_state_machine`、`idor_*`、`biz_logic_scanner`、
  `biz_logic_v2`
- 侦察与面：`crawler`、`attack_surface`、`attack_graph`、`attack_tree`、`param_miner`、
  `adaptive_fuzzer`、`adaptive_payload`、`batch_recon`
- 专项：`jwt_*`、`graphql_*`、`cloud_pwn`、`domain_attacks` / `domain_hunt`、
  `container_*`、`binary_analyzer`
- 编排与验证：`chain_engine`、`cross_validator`、`constraint_graph`、`workflow_*`、
  `deviation_oracle`、`dual_session`、`context_memory`

完整 136 项名单见 `assets/aimy-skill-index.md` 第三节。

### 2.5 CLI：87 条顶层命令 + 14 条 kali 子命令

在**内置根目录**内执行：

```bash
python main.py --help            # 列出全部用法
python main.py <command> ...     # 顶层命令（87 条）
python main.py --kali-host <h> kali <sub>   # kali 组（14 条子命令）
```

顶层命令按用途分组（节选 84 条，全 87 条见索引第二节）：

| 分组 | 代表命令 |
|------|----------|
| 侦察 / 面 | `recon`、`autohunt`、`batch-recon`、`dirfuzz`、`crawl`、`param-mine`、`portscan`、`cms-fingerprint`、`leak-scan` |
| 注入 | `sqlcheck`、`sqli-blind`、`sqli-oob`、`sqli-second-order`、`sqli-weaponize`、`xsscheck`、`xss-validate`、`xss-verify`、`dom-xss`、`cmdi`、`ssti`、`nosqli`、`xxe`、`crlf-injection`、`hpp`、`proto-pollution`、`deser`、`payload-mutate` |
| 访问控制 / 认证 | `auth-bypass`、`auth-cookie-tamper`、`auth-default-creds`、`auth-header-injection`、`auth-mass-assignment`、`auth-method-bypass`、`idor`、`unauth`、`weakpass`、`saml-sso` |
| 令牌 | `jwt`、`jwt-attack`、`jwt-exploit` |
| 文件 / 包含 | `lfi`、`file-upload` |
| 服务端请求 | `ssrf`、`ssrf-pwn`、`ssrf-lateral` |
| 逻辑 | `bizlogic`、`bizlogic-v2`、`race`、`race-profile`、`workflow`、`workflow-trace`、`constraint`、`deviation` |
| 协议 / 传输 | `smuggle`、`smuggler`、`web-cache`、`cors`、`csrf`、`clickjacking`、`open-redirect` |
| 链式利用 | `chain`、`chain-sqli-auth`、`chain-sqli-lfi`、`chain-ssrf-lfi` |
| 武器化 / 后利用 | `reverse-shell`、`webshell`、`deser-weaponize`、`cloud-pwn`、`domain` |
| 自动 / 编排 | `auto`、`deepscan`、`quickscan`、`fuzz`、`fuzz-engine`、`proxy`、`capture`、`login`、`list` |
| 对抗检测 | `waf`、`waf-heavy`、`verify` |
| 其他面 | `mobile-scan`、`binary-scan`、`code-audit`、`graphql`、`graphql-abuse`、`kali` |

`kali` 组（`main.py --kali-host <host> kali <sub>`，14 条）：`connect`、`list-tools`、`exec`、
`autoexploit`、`nmap`、`nikto`、`nuclei`、`sqlmap`、`ffuf`、`gobuster`、`hydra`、`wpscan`、
`whatweb`、`msfconsole`。

### 2.6 路径解析（与会话 cwd 无关）

`src/aimy.ts` 把内置根**从插件自身模块 URL 推导**，因此渲染出的绝对路径是"安装相对"的，
在任何工作区下都相同；包内不含个人路径或环境信息。

```ts
resolveAimySkillPaths(env?)  // → { root, index } 均为绝对路径
```

- 默认：`<package>/assets/aimy-skill/` 与 `<package>/assets/aimy-skill-index.md`
- 覆盖：环境变量 `DSH_AIMY_SKILL_DIR` 指向别处的副本（例如仓库 checkout）
- 解析是**纯函数**（不做文件系统探测）：发布包的布局由 `package.json` 的 `files` 固定
- 策略提示词要求产物写入**会话工作目录**，工具链目录只读

已在真实安装布局下验证：把 tarball 装进空项目后，`root` 落在 `node_modules/@bainianling/...`
内、`main.py` 与 102 个技能目录均存在，且路径不在 cwd 之下。

### 2.7 运行环境

```bash
cd <内置根>                       # 或 $DSH_AIMY_SKILL_DIR
pip install -r requirements.txt   # requests / beautifulsoup4 / PyJWT / cryptography
python main.py --help
```

- `playwright install chromium` 仅在 **SPA 爬虫**与**浏览器级 XSS 验证**（`xss-verify`）时需要。
- `kali` 组命令需要可达的 Kali 主机（`--kali-host`）或本地 Kali（`--kali-local`）。
- Python 依赖**不在本包内**，需使用前自行安装。

### 2.8 系统块渲染的内容

激活 `aimy-skill` 后，模型在系统提示词中实际拿到：

1. 策略自身的 4 段指令（授权语境 / 优先用工具链而非回忆 / 证据先行并打标签 / 工具链是库不是自动扫描器）；
2. `Bundled toolkit root: <绝对路径>`
3. `Generated index: <绝对路径>`
4. 一段使用说明：说明工具链**随插件分发、不是 cwd 里的 checkout、读取无需联网**，给出内容规模，
   规定阅读顺序（**先读索引 → 再读该技能 SKILL.md → 再读它点名的配套文档**），给出 CLI 运行方式
   （先装依赖、在工具链根目录跑 `python main.py <command>`），并要求相对路径都相对内置根解析、
   产物写在工作目录。

索引本身**被引用而非内联**——它覆盖数百条目，设计为按需读取。

---

## 三、与 `master` 的差异

```
master (a73b34e)
   └── v1 (8b61ba5)  ← 本分支
```

| 变更 | 内容 |
|------|------|
| 新增资源 | `assets/aimy-skill/`（441 文件）、`assets/aimy-skill-index.md`、`assets/README.md` |
| 新增模块 | `src/aimy.ts`（路径解析 + 系统块渲染），导出 `./aimy` 子路径 |
| 新增策略 | `aimy-skill`（id / 名称 / 4 段 system / `aimy` 描述符 / 类别 `security-toolkit`） |
| 新增测试 | `tests/aimy.spec.ts`（9 项）+ `jailbreak-mode.spec.ts` 集成断言 1 项 |
| 元数据 | 版本 → `0.1.0-rc.14`，`files: ["lib", "assets"]`，description 提及内置工具链 |
| 构建约定 | `.gitattributes` 为 `assets/aimy-skill/**` 关闭 text/eol/编码转换 |
| 文档 | `README.md`、`STRATEGIES.md`、`BRANCH-V1.md`（本文） |
| 产物 | `dist/npm/bainianling-dsh-jailbreak-mode-0.1.0-rc.14.tgz`（3,021,459 字节） |

## 四、质量验证

| 项 | 结果 |
|----|------|
| 类型检查 | `tsc --noEmit -p tsconfig.check.json` 通过 |
| 单元测试 | **90 项全通过**（5 个测试文件；含 9 项 aimy 专项 + 1 项集成断言） |
| 内置树一致性 | 441/441 blob 与上游 commit 一致（对**提交对象**复核，非仅工作区） |
| 真实安装 | tarball 装入空项目后路径解析、`main.py`、102 技能目录均存在 |
| 计数一致性 | 策略元数据与 `AIMY_SKILL_*` 常量由测试断言对齐索引 |
| 凭据扫描 | 无密钥 / 令牌 / 私钥模式命中 |
| 隐私扫描 | 无本机路径或用户名（命中的 `/home/user/` 等为上游通用示例） |

## 五、使用边界

本分支只服务于**学习交流与获得授权的安全研究**（红队评估、CTF、自有或书面授权的目标）。
破甲模式仅改写提示词，不移除提供方一侧的审核；工具链只是库，对**在范围外**目标使用不在授权之内。
使用者须自行遵守所在地法律及所接入模型服务方的条款。

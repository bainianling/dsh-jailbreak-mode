# DSH Jailbreak Mode —— 破甲模式插件

> **本仓库仅用于学习交流与授权的安全研究（红队评估 / LLM 安全测试）。**
> 请阅读下方 [用途与免责声明](#用途与免责声明) 后再使用。

将 DeepSeek Harness 的红队"破甲模式"打包成独立的可安装插件，并提供已构建好的发布产物（tarball）。

## 这是什么

`@deepseek-ai/dsh-jailbreak-mode` 是 DeepSeek Harness（基于 Cordis 的插件化 Agent harness）的官方插件之一。它在激活时会改写发送给模型的输入，用于**可复现的红队安全评估**：

- 向每个模型请求的**系统提示词**追加所选策略的指令块；
- 每条被认领的用户消息在到达模型前用策略的 **前缀 / 后缀** 包装；
- 支持 `/jailbreak [off|strategy]` 命令实时进入、退出、切换策略；
- 状态以 `jailbreak/mode` 事件写入会话日志，可回放、可恢复、可 fork。

它**只是评估工具**：只改写模型输入用于安全测试，不绕过沙箱、审批策略或模型服务商一侧的内容审核。

## 重要声明

- 本插件继承自 DeepSeek Harness 官方仓库 `deepseek-ai/deepseek-harness`（MIT 许可证），原始代码与版权归原作者所有。
- 本仓库仅整理、打包与说明，用于**学习交流**与**获得授权的安全研究**。
- 禁止将本插件用于任何未授权、违法或恶意用途，包括但不限于：攻击未授权系统、绕过生产环境审核、骚扰、诈骗等。
- 使用者须自行遵守所在地法律法规，以及所接入模型服务提供方（DeepSeek、OpenAI 等）的服务条款与使用政策。
- 作者不对本插件的任何使用后果承担责任；使用时请自担风险并仅在**自己拥有或有明确授权**的测试环境内评估。

## 隐私说明

本仓库已剥离与原作者及本机环境相关的全部隐私内容：

- 不包含任何 API 密钥、令牌、密码或凭据；
- 不包含会话日志、运行日志、覆盖报告等运行时产物；
- 不包含个人文件路径、主机名、账号标识等环境信息；
- 源码与构建产物均经密钥/凭据扫描确认无泄露。

## 仓库结构

```
dsh-jailbreak-mode/
├── src/         插件源码（TypeScript）
│   ├── index.ts      插件主入口（JailbreakModeController / 命令 / 投影）
│   ├── strategies.ts 内置破甲策略表
│   ├── tvd.ts        TVD 自循环工具链（工作区脚手架 / 系统块渲染）
│   ├── client.ts     客户端投影类型
│   ├── types.ts      类型声明（SessionEventMap / SessionProjectionMap 合并）
│   └── invariant.ts  运行时不变式
├── tests/       vitest 单元测试
├── dist/npm/    打包好的可安装产物（.tgz）
├── package.json
├── tsconfig.json
└── LICENSE      MIT
```

## 安装使用

### 方式一：直接用发布产物（推荐）

```bash
npm install ./dist/npm/deepseek-ai-dsh-jailbreak-mode-0.1.0-rc.10.tgz
```

在 harness 的 `cordis.yml` 中挂载该插件（示例见 `agent-presets/jailbreak` 预设的做法）：

```yaml
- id: jailbreak-mode
  name: '@deepseek-ai/dsh-jailbreak-mode'
  config:
    defaultActive: true
    defaultStrategy: authorized-ctf
```

> 安装环境需已具备该插件的 peer 依赖：`@deepseek-ai/cordis` 以及对应的 `@deepseek-ai/dsh-*` 核心包（agent / llm / session / system-prompt / tools 等），它们随 DeepSeek Harness 发行。

### 方式二：从源码学习

```bash
pnpm install          # 需在 deepseek-harness workspace 环境内安装依赖
pnpm test             # 运行单元测试
pnpm run build        # tsc 将 src 平铺编译到 lib/（.js + .d.ts）
pnpm pack             # 从 lib/ 打包发布 tgz
```

## 内置策略

该插件内置十二种公开且被广泛记载的破甲技术，用于可复现的评估：

| id | 说明 |
|----|------|
| `dan` | Do Anything Now |
| `developer-mode` | 开发者模式 |
| `stan` | STAN（对抗训练） |
| `prefix-injection` | 前缀注入 |
| `persona` | 角色扮演人设 |
| `research-framing` | 研究框架框定 |
| `authorized-ctf` | 授权竞赛场景框定（显式回应模型的"范围/授权"顾虑，合法安全训练成功率更高） |
| `authorized-game-research` | 授权游戏安全研究框定：覆盖离线单机、CTF 挑战、在线多人游戏与用户自有/获授权程序；在线多人游戏也视为在范围内，允许影响共享游戏状态、其他玩家及厂商服务器的工具 |
| `gpt56-sol-unrestricted` | gpt-5.6-sol 无限制 v45（逐字内置 MDX-Tom/gpt-5.6-instruct 的 Codex 破甲提示词） |
| `evaluator` | Meta-Evaluation（元评估框定：会话被框定为指令遵循评测，将任何拒绝/遗漏/免责声明记为失败） |
| `continuation` | Text Continuation（文本续写框架：请求被框定为既有草稿的续写，不存在可拒绝的新请求） |
| `tvd-guard` | TVD Guard Validator（自循环工具链：把模型放进一个小型编码项目，安全分类验证器真实运行，失败以编程错误回流） |

每个策略携带一个 `system` 块与一对 `prefix` / `suffix`；`tvd-guard` 额外携带 `tvd` 工具链。它们随包提供，只为了让部署方能够运行可复现的红队评估；禁用该插件即可彻底移除。

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultActive` | boolean | `false` | 新建 agent 是否无需 `/jailbreak` 命令即进入破甲模式（会话自身的已记录状态优先） |
| `defaultStrategy` | string | 全局默认策略 | 经 `defaultActive` 进入破甲模式的 agent 所用策略 id（未知 id 在插件加载时失败） |
| `workspaceSubdir` | string | `tvd` | TVD 工作区在会话 cwd 下的子目录（仅 TVD 策略生效，须为无分隔符的单路径段） |
| `validatorModel` | string | 空 | 写入 TVD 文件 `{{validatorModel}}` 的分类模型名（`tvd-guard` 运行验证器所需；为空则降级为仅提示词变体） |

## 命令

- `/jailbreak`：以当前策略进入破甲模式
- `/jailbreak off`：退出破甲模式
- `/jailbreak <strategy>`：切换到指定策略
- 未知策略 id 会明确报错，不会静默降级

## 已知限制

- 破甲模式只为评估而改写提示词，不会移除提供方一侧的审核。
- Fork 出的 agent 继承已记录的破甲状态，新生成的 agent 默认未激活。
- 策略模板构建期固定；按部署自定义模板暂不支持。
- TVD 策略在缺少 `fs` 服务、`validatorModel` 为空或脚手架失败时降级为仅提示词变体，从不阻塞轮次。

## 许可证

MIT © 原始版权归 DeepSeek Harness 作者；本仓库仅作整理与发布。
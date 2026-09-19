#!/usr/bin/env node
/**
 * Generate `assets/aimy-skill-triggers.json` from the vendored aimy-skill tree.
 *
 * The file is the machine-readable half of the automatic skill invocation: the
 * plugin matches the current step's user text against these triggers and injects
 * the winning `SKILL.md` body without waiting for the model to decide to look.
 *
 * Two inputs, deliberately separated:
 *
 * 1. **Derived** — skill names, frontmatter descriptions, companion documents and
 *    categories all come from the vendored tree, so a re-vendor cannot leave the
 *    triggers describing a tree that is no longer there.
 * 2. **Curated** — {@link ALIASES} below. Models and users name vulnerabilities in
 *    ways the upstream `name:`/`description:` fields never spell out, and Chinese
 *    prompts are not represented upstream at all. This table is the only
 *    hand-maintained part; everything else is read from disk.
 *
 * Usage: `node scripts/generate-aimy-triggers.mjs`
 * The vendored tree itself is never written to.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(REPO, 'assets', 'aimy-skill')
const SKILLS = join(BUNDLE, 'ai-mian', 'hack-skills', 'skills')
const CATEGORIES = join(BUNDLE, 'ai-mian', 'hack-skills', 'site', 'data', 'categories.yaml')
const OUT = join(REPO, 'assets', 'aimy-skill-triggers.json')

/** Upstream skill directory -> extra search aliases (English and Chinese). */
const ALIASES = {
  '401-403-bypass-techniques': ['403', '401', '访问拒绝', '绕过403', '未授权访问绕过', 'forbidden bypass'],
  'active-directory-acl-abuse': ['acl', 'bloodhound', '域权限', 'ad acl', 'write dacl', 'dcsync', '域控'],
  'active-directory-certificate-services': ['adcs', 'esc1', '证书服务', 'ad 证书', '证书模板'],
  'active-directory-kerberos-attacks': ['kerberos', 'kerberoasting', 'as-rep', '黄金票据', '白银票据', '域认证', '票据'],
  'ai-ml-security': ['模型安全', '对抗样本', '提示词注入', 'ai安全', 'llm安全', '模型窃取', 'pickle'],
  'android-pentesting-tricks': ['android', '安卓', 'apk', 'frida', 'ssl pinning', '证书固定', 'webview'],
  'anti-debugging-techniques': ['反调试', 'anti-debug', 'ptrace', '反反调试', '调试检测'],
  'api-auth-and-jwt-abuse': ['api认证', 'bearer', 'api key', 'apikey', 'api 令牌'],
  'api-authorization-and-bola': ['bola', '越权', 'api越权', '对象级授权', '接口越权'],
  'api-recon-and-docs': ['api发现', 'openapi', 'swagger', '接口文档', 'api资产'],
  'api-sec': ['api安全', '接口安全', 'api测试'],
  'arbitrary-write-to-rce': ['任意写', 'arbitrary write', 'got表', 'io_file', 'modprobe', 'vtable', '写原语'],
  'auth-sec': ['认证安全', '授权安全', '登录安全', '会话安全'],
  'authbypass-authentication-flaws': ['认证绕过', 'auth bypass', '登录绕过', 'mfa绕过', '密码重置', '验证码绕过', '双因素'],
  'binary-protection-bypass': ['保护绕过', 'aslr', 'pie', 'canary', 'nx', 'relro', 'cet', 'mt保护', '缓解措施'],
  'browser-exploitation-v8': ['v8', '浏览器漏洞', 'chrome漏洞', 'js引擎', 'jit', '类型混淆', '沙箱逃逸'],
  'business-logic-vuln': ['业务逻辑', '逻辑漏洞', '业务漏洞'],
  'business-logic-vulnerabilities': ['业务逻辑漏洞', '逻辑缺陷', '流程绕过', '价格篡改', '优惠券', '状态机'],
  'classical-cipher-analysis': ['古典密码', '凯撒', '维吉尼亚', '栅栏', 'xor', '频率分析', '替换密码', '仿射'],
  clickjacking: ['点击劫持', 'clickjacking', 'x-frame-options', 'frame-ancestors', '界面伪装'],
  'cmdi-command-injection': ['命令注入', '命令执行', 'rce', 'cmdi', 'os命令', '命令拼接', '反弹shell'],
  'code-obfuscation-deobfuscation': ['代码混淆', '去混淆', '控制流平坦化', '花指令', 'ollvm', 'vmp', '混淆还原'],
  'container-escape-techniques': ['容器逃逸', 'docker逃逸', '容器突破', 'docker socket', '特权容器', 'cgroup', 'namespace'],
  'cors-cross-origin-misconfiguration': ['cors', '跨域', '跨域配置', 'origin', '跨域漏洞'],
  'crlf-injection': ['crlf', 'crlf注入', '响应拆分', 'http头注入'],
  'csp-bypass-advanced': ['csp', 'csp绕过', '内容安全策略', 'nonce绕过'],
  'csrf-cross-site-request-forgery': ['csrf', '跨站请求伪造', 'xsrf', 'token绕过', 'samesite'],
  'csv-formula-injection': ['csv注入', '公式注入', 'csv formula', 'excel注入'],
  'dangling-markup-injection': ['dangling markup', '悬挂标记', '标记注入', '信息泄露'],
  'defi-attack-patterns': ['defi', '闪电贷', 'flashloan', '价格操纵', '重入'],
  'dependency-confusion': ['依赖混淆', 'dependency confusion', '供应链', 'npm投毒', 'pip投毒', '私有仓库'],
  'deserialization-insecure': ['反序列化', 'deserialization', 'java反序列化', 'php反序列化', 'python反序列化', 'gadget', 'ysoserial'],
  'dns-rebinding-attacks': ['dns重绑定', 'dns rebinding', 'ssrf绕过', '内网探测'],
  'email-header-injection': ['邮件头注入', 'email injection', '邮件伪造', 'smtp注入'],
  'expression-language-injection': ['el注入', '表达式注入', 'spel', 'ognl', 'el表达式'],
  'file-access-vuln': ['文件操作漏洞', '任意文件读取', '任意文件下载', '文件删除', '任意文件写'],
  'format-string-exploitation': ['格式化字符串', 'format string', 'printf漏洞', '任意地址写'],
  'ghost-bits-cast-attack': ['ghost bits', '类型转换攻击', '浮点转换'],
  'graphql-and-hidden-parameters': ['graphql', '内省', 'introspection', '隐藏参数', '批量查询'],
  hack: ['渗透测试', '渗透', '渗透流程', '攻击流程', '红队流程', 'pentest', '安全测试', '渗透方法论'],
  'hash-attack-techniques': ['哈希', 'hash', '彩虹表', 'hashcat', '碰撞', '长度扩展', '爆破hash'],
  'heap-exploitation': ['堆', 'heap', '堆溢出', 'use after free', 'uaf', 'tcache', 'fastbin', 'house of', '堆利用'],
  'http-host-header-attacks': ['host头攻击', 'host header', '主机头', '密码重置投毒'],
  'http-parameter-pollution': ['hpp', '参数污染', 'http参数污染'],
  'http2-specific-attacks': ['http2', 'http/2', 'h2c', '请求走私h2'],
  'idor-broken-object-authorization': ['idor', '越权访问', '水平越权', '垂直越权', '对象引用', '未授权访问'],
  'injection-checking': ['注入检测', '注入测试', '注入漏洞'],
  'insecure-source-code-management': ['源码泄露', 'git泄露', 'svn泄露', 'ds_store', '代码管理不当'],
  'ios-pentesting-tricks': ['ios', '苹果', 'ipa', 'ios测试'],
  'jndi-injection': ['jndi', 'jndi注入', 'ldap注入', 'rmi', 'log4j', 'log4shell'],
  'jwt-oauth-token-attacks': ['jwt', 'jwt攻击', '令牌伪造', 'oauth', 'oidc', '算法混淆', '密钥混淆'],
  'kernel-exploitation': ['内核', 'kernel', '内核提权', '内核漏洞', '提权漏洞', '内核堆'],
  'kubernetes-pentesting': ['kubernetes', 'k8s', 'k8s渗透', '集群安全', 'pod逃逸'],
  'lattice-crypto-attacks': ['格密码', 'lattice', 'lll', 'rsa格', 'coppersmith'],
  'linux-lateral-movement': ['linux横向', '内网横向', '横向移动', 'ssh横向', '内网渗透'],
  'linux-privilege-escalation': ['linux提权', '提权', '权限提升', 'suid', 'sudo提权', 'capabilities', '计划任务', 'nfs提权'],
  'linux-security-bypass': ['linux防护绕过', '安全机制绕过', 'selinux', 'apparmor'],
  'llm-prompt-injection': ['提示词注入', 'prompt injection', '越狱', 'jailbreak', 'llm越狱'],
  'macos-process-injection': ['macos注入', 'dylib劫持', 'xpc', 'mac注入'],
  'macos-security-bypass': ['macos绕过', 'tcc', 'mac安全', 'sip'],
  'memory-forensics-volatility': ['内存取证', 'volatility', '内存镜像', '内存分析'],
  'mobile-ssl-pinning-bypass': ['证书固定绕过', 'ssl pinning', '抓包绕过', 'ssl pinning bypass'],
  'network-protocol-attacks': ['网络协议', '中间人', 'mitm', 'arp欺骗', 'dns欺骗', '名称解析'],
  'nosql-injection': ['nosql注入', 'mongodb注入', 'nosqli', 'mongo注入'],
  'ntlm-relay-coercion': ['ntlm', 'ntlm中继', '中继攻击', '强制认证', 'coerce'],
  'oauth-oidc-misconfiguration': ['oauth', 'oidc', 'oauth配置', 'sso', '单点登录', '重定向劫持'],
  'open-redirect': ['开放重定向', 'open redirect', '跳转漏洞', 'url跳转'],
  'path-traversal-lfi': ['路径穿越', '目录穿越', 'lfi', '文件包含', '任意文件读取', '本地文件包含', '目录遍历', '../'],
  'prototype-pollution': ['原型链污染', '原型污染', 'prototype pollution', 'js原型'],
  'prototype-pollution-advanced': ['原型链利用', '原型链gadget', '客户端原型污染'],
  'race-condition': ['条件竞争', '竞态', 'race condition', '并发漏洞', '竞争条件', '薅羊毛'],
  'recon-and-methodology': ['信息收集', '资产收集', '侦察', 'recon', '子域名', '指纹识别', '信息搜集'],
  'recon-for-sec': ['信息收集方法', '资产发现', '攻击面梳理'],
  'request-smuggling': ['请求走私', 'request smuggling', 'http走私', 'cl.te', 'te.cl', '走私'],
  'reverse-shell-techniques': ['反弹shell', 'reverse shell', 'shell生成', 'nc反弹', 'bash反弹'],
  'rsa-attack-techniques': ['rsa', 'rsa攻击', 'rsa共模', '低加密指数', '费马分解', 'wiener', 'rsa解密'],
  'saml-sso-assertion-attacks': ['saml', 'saml攻击', '断言伪造', 'sso攻击', 'xml签名'],
  'sandbox-escape-techniques': ['沙箱逃逸', 'sandbox escape', 'python沙箱', 'seccomp', '绕过沙箱', '沙盒逃逸'],
  'smart-contract-vulnerabilities': ['智能合约', 'solidity', '合约漏洞', '重入攻击', '以太坊'],
  'sqli-sql-injection': ['sql注入', 'sqli', 'sql injection', '盲注', '报错注入', '联合注入', '堆叠注入', '布尔盲注', '时间盲注', '注入点'],
  'ssrf-server-side-request-forgery': ['ssrf', '服务端请求伪造', '请求伪造', '内网探测', '云元数据', 'gopher'],
  'ssti-server-side-template-injection': ['ssti', '模板注入', '服务端模板注入', 'jinja2', 'freemarker', 'twig', 'velocity'],
  'stack-overflow-and-rop': ['栈溢出', 'stack overflow', 'rop', 'ret2libc', 'ret2text', '栈利用', 'gadget'],
  'steganography-techniques': ['隐写', '隐写术', 'stego', '图片隐写', '盲水印', 'lsb', '文件隐写'],
  'subdomain-takeover': ['子域名接管', 'subdomain takeover', 'cname', '域名劫持'],
  'symbolic-execution-tools': ['符号执行', 'angr', 'z3', '约束求解', '符号化'],
  'symmetric-cipher-attacks': ['对称加密', 'aes', 'des', '分组密码', 'ecb', 'cbc翻转', '填充oracle', 'aes攻击'],
  'traffic-analysis-pcap': ['流量分析', 'pcap', '抓包分析', 'wireshark', '流量取证', '数据包分析'],
  'tunneling-and-pivoting': ['隧道', '内网代理', '端口转发', 'pivoting', '代理穿透', 'frp', 'ew'],
  'type-juggling': ['类型混淆', 'type juggling', '松散比较', '弱类型', 'php弱类型', 'md5绕过'],
  'unauthorized-access-common-services': ['未授权访问', '未授权', 'redis未授权', 'elasticsearch未授权', 'mongodb未授权', '弱口令服务'],
  'upload-insecure-files': ['文件上传', 'upload', '上传漏洞', 'webshell上传', '上传绕过', 'getshell'],
  'vm-and-bytecode-reverse': ['字节码', '虚拟机保护', 'vm逆向', 'bytecode', 'python字节码', '字节码反编译'],
  'waf-bypass-techniques': ['waf绕过', 'waf bypass', '绕waf', '免杀waf', 'waf指纹'],
  'web-cache-deception': ['缓存欺骗', '缓存投毒', 'web cache', '缓存漏洞', '缓存key'],
  'websocket-security': ['websocket', 'ws安全', 'websocket漏洞', '跨站websocket劫持'],
  'windows-av-evasion': ['免杀', 'av绕过', '杀软绕过', 'amsi', 'amsi绕过', 'edr绕过', 'bypass av'],
  'windows-lateral-movement': ['windows横向', '横向移动', '票据传递', 'psexec', 'wmi', 'smb横向', '凭据窃取', 'mimikatz'],
  'windows-privilege-escalation': ['windows提权', '提权', '土豆提权', 'uac绕过', '令牌窃取', 'juicypotato', '服务提权'],
  'xslt-injection': ['xslt注入', 'xslt', 'xml转换注入'],
  'xss-cross-site-scripting': ['xss', '跨站脚本', '跨站', '脚本注入', 'dom xss', '存储型xss', '反射型xss', 'cookie窃取'],
  'xxe-xml-external-entity': ['xxe', 'xml外部实体', '外部实体注入', 'xml注入', 'xml实体'],
}

/** Triggers too generic to route on: they match nearly every security prompt. */
const STOPWORDS = new Set([
  'sec', 'security', 'attack', 'attacks', 'tools', 'tool', 'techniques', 'technique',
  'vulnerability', 'vulnerabilities', 'vuln', 'and', 'the', 'for', 'with', 'when',
  'playbook', 'advanced', 'common', 'misc', 'test', 'testing', 'check', 'checking',
  'use', 'used', 'using', 'web', 'file', 'files', 'based', 'specific', 'other',
])

/**
 * Derived words that are real signal only in combination.
 *
 * Words that name a *class* of bug rather than a target (`injection`, `cross`,
 * `site`) stay as weak triggers — two together still route — but cannot fire
 * alone. The split made here is purely lexical, from the directory name.
 *
 * A trigger that is not a name fragment but is still too generic to route on
 * (a word shared by many skills, or a bare class noun like `api` or `type`) is
 * demoted at match time instead, by `genericTriggers` in `src/aimy-triggers.ts`
 * — the running code is the authority for what it will act on.
 */
const WEAK_ONLY = new Set([
  'injection', 'insecure', 'bypass', 'abuse', 'attacks', 'authorization',
  'misconfiguration', 'techniques', 'exploitation', 'attack', 'advanced',
  'analysis', 'management', 'access', 'common', 'specific', 'related',
  'vulnerabilities', 'vulnerability', 'security', 'server', 'side', 'cross',
  'site', 'scripting', 'request', 'forgery', 'origin', 'headers', 'header',
  'parameters', 'parameter', 'code', 'source', 'process', 'protocol', 'network',
  'privilege', 'escalation', 'lateral', 'movement', 'tricks', 'patterns',
  'violations', 'flaws', 'services', 'service', 'tools', 'tool', 'checking',
  'pollution', 'deception', 'entity', 'external', 'assertion', 'takeover',
  'exploits', 'interfaces', 'objects', 'hidden', 'docs', 'databases',
])

/** Split a skill directory name into its meaningful words. */
function nameWords(name) {
  return name.split('-').filter(word => word.length > 1 && !STOPWORDS.has(word))
}

/**
 * Parse the `name:` / `description:` frontmatter block of a SKILL.md.
 *
 * Line-based rather than one regex: a folded scalar (`>-`) continues on
 * indented lines, and a single multiline regex tends to stop at the first line
 * end because `$` matches before every newline.
 */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return {}
  const lines = match[1].split(/\r?\n/)
  let name
  const description = []
  let inDescription = false
  for (const line of lines) {
    const key = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (key !== null) {
      inDescription = key[1] === 'description'
      if (inDescription) {
        // Drop the block-scalar indicator; the body follows on later lines.
        const inline = key[2].trim()
        if (inline !== '' && !/^[>|]-?$/.test(inline)) description.push(inline)
      } else if (key[1] === 'name') {
        name = key[2].trim()
      }
      continue
    }
    if (inDescription) {
      const folded = line.trim()
      if (folded !== '') description.push(folded)
    }
  }
  return {
    ...(name === undefined ? {} : { name }),
    ...(description.length === 0 ? {} : { description: description.join(' ') }),
  }
}

const categoryYaml = readFileSync(CATEGORIES, 'utf8')
const categoryOf = new Map()
{
  let current
  for (const line of categoryYaml.split(/\r?\n/)) {
    const id = /^ {2}- id:\s*(\S+)/.exec(line)
    if (id !== null) { current = id[1]; continue }
    const skill = /^ {6}- (\S+)/.exec(line)
    if (skill !== null && current !== undefined) categoryOf.set(skill[1], current)
  }
}

const skills = []
for (const dir of readdirSync(SKILLS, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const skillPath = join(SKILLS, dir.name, 'SKILL.md')
  if (!existsSync(skillPath)) continue
  const meta = frontmatter(readFileSync(skillPath, 'utf8'))
  const companions = readdirSync(join(SKILLS, dir.name))
    .filter(entry => entry !== 'SKILL.md' && entry.toLowerCase().endsWith('.md'))
    .sort()
  const triggers = new Set()
  // Strong: the full directory name plus curated aliases — each names exactly
  // one skill, so a single hit is enough to route.
  const strong = new Set([dir.name.toLowerCase()])
  for (const alias of ALIASES[dir.name] ?? []) strong.add(alias.toLowerCase())
  // Weak: individual words of the directory name — real signal, never decisive
  // on their own.
  const weak = new Set()
  for (const word of nameWords(dir.name)) {
    if (strong.has(word)) continue
    if (WEAK_ONLY.has(word)) weak.add(word)
    else strong.add(word)
  }
  for (const t of strong) triggers.add(t)
  skills.push({
    name: dir.name,
    category: categoryOf.get(dir.name) ?? 'unknown',
    description: meta.description ?? '',
    path: `ai-mian/hack-skills/skills/${dir.name}/SKILL.md`,
    ...(companions.length === 0 ? {} : { companions }),
    strong: [...strong].filter(t => t.length >= 2 && !STOPWORDS.has(t)).sort(),
    ...(weak.size === 0 ? {} : { weak: [...weak].filter(t => t.length >= 2).sort() }),
  })
}
skills.sort((a, b) => a.name.localeCompare(b.name))

const bundleReadme = readFileSync(join(BUNDLE, 'main.py'), 'utf8')
const version = /^VERSION\s*=\s*"([^"]+)"/m.exec(bundleReadme)?.[1]
if (version === undefined) throw new Error('could not read VERSION from main.py')

const payload = {
  $comment: 'Generated by scripts/generate-aimy-triggers.mjs — do not edit by hand.',
  version,
  commit: '0c56eb161a10ce5fdea103cf8b92ced9a8f51e66',
  skillCount: skills.length,
  // Scoring contract: one `strong` hit routes on its own; `weak` hits must reach
  // two before they compete. Kept here so the plugin never hard-codes the rule.
  strongWeight: 3,
  weakWeight: 1,
  threshold: 3,
  skills,
}
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

const strongTotal = skills.reduce((sum, s) => sum + s.strong.length, 0)
const weakTotal = skills.reduce((sum, s) => sum + (s.weak?.length ?? 0), 0)
const missing = skills.filter(s => (ALIASES[s.name] ?? []).length === 0).map(s => s.name)
console.log(`wrote ${OUT}`)
console.log(`skills=${skills.length} strong=${strongTotal} weak=${weakTotal} version=${version}`)
if (missing.length > 0) console.log(`no curated aliases (derived triggers only): ${missing.join(', ')}`)

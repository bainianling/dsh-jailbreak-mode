# aimy-skill 内置索引（bundled index）

> 本文件由内置的 `assets/aimy-skill/` 树生成，供模型在破甲模式 `aimy-skill` 策略激活时快速定位资源。
> 上游：<https://github.com/Prohao42/aimy-skill>（MIT），内置版本 3.7.0，随包分发。
> 下列路径均以**内置根目录**为基准；激活该策略时，系统提示词会给出它的绝对路径，请据此拼出完整路径。

- Attack Skills 提示词：**102** 个（`ai-mian/hack-skills/skills/<name>/SKILL.md`，多数带同名配套文档）
- Python 工具模块：**136** 个（`tools/*.py`，统一 `check()` 接口 + 结构化 JSON 输出）
- CLI 子命令：**87** 个（顶层 `main.py <command>`，表见下；另有 14 个 `kali` 组内子命令）

## 一、Attack Skills 提示词包

把内置根的 `ai-mian/hack-skills/skills/` 当作技能库：先读 `hack/SKILL.md`（P0 路由）确定测试阶段，
再按下面的名字打开对应 `SKILL.md`。配套文档（`SCENARIOS.md` / `*_MATRIX.md` / `*_COOKBOOK.md` 等）按需加载。

| 技能目录 | 用途 | 配套文档 |
| --- | --- | --- |
| `401-403-bypass-techniques` | 401/403 bypass playbook. Use when encountering access-denied responses on admin panels, API endpoints, or restricted paths. Covers path manipulation, HTTP method tampering, header injection, protocol downgrade, and automated bypass tools. | — |
| `active-directory-acl-abuse` | Active Directory ACL abuse playbook. Use when exploiting misconfigured AD permissions including GenericAll, WriteDACL, DCSync rights, shadow credentials, LAPS reading, GPO abuse, and BloodHound-guided attack paths. | BLOODHOUND_PATHS.md |
| `active-directory-certificate-services` | AD Certificate Services attack playbook. Use when targeting misconfigured AD CS for privilege escalation via ESC1-ESC13 template abuse, NTLM relay to enrollment, CA officer abuse, and certificate-based persistence. | ADCS_ESC_MATRIX.md |
| `active-directory-kerberos-attacks` | Kerberos attack playbook for Active Directory. Use when targeting AD authentication via AS-REP roasting, Kerberoasting, golden/silver/diamond tickets, delegation abuse, or pass-the-ticket attacks. | KERBEROS_ATTACK_CHAINS.md |
| `ai-ml-security` | AI/ML security playbook. Use when assessing model supply chain attacks (pickle RCE, poisoned weights), adversarial examples, model poisoning, model stealing, data privacy attacks (membership inference, model inversion), and autonomous agent security risks. | — |
| `android-pentesting-tricks` | Android pentesting playbook. Use when testing Android applications for SSL pinning bypass, exported component abuse, WebView vulnerabilities, intent redirection, root detection bypass, tapjacking, and backup extraction during authorized mobile security assessments. | FRIDA_SCRIPTS.md |
| `anti-debugging-techniques` | Anti-debugging detection and bypass playbook. Use when reversing protected binaries that detect debuggers via ptrace, PEB flags, timing checks, or signal/exception handlers on Linux and Windows. | ANTI_DEBUG_MATRIX.md |
| `api-auth-and-jwt-abuse` | API authentication and JWT abuse playbook. Use when testing bearer tokens, API keys, claim trust, header spoofing, rate limits, and API auth boundary weaknesses. | — |
| `api-authorization-and-bola` | API authorization and BOLA testing playbook. Use when APIs expose object identifiers, nested resources, hidden writable fields, or weak function-level authorization. | — |
| `api-recon-and-docs` | API reconnaissance and documentation review playbook. Use when discovering endpoints, schemas, versions, OpenAPI specs, hidden docs, and surface area for API testing. | — |
| `api-sec` | Entry P1 category router for API security. Use when choosing between API recon, authorization, token abuse, and hidden-parameter workflows before any deeper API topic skill. | — |
| `arbitrary-write-to-rce` | Arbitrary write to RCE playbook. Use when you have an arbitrary write primitive (from heap exploitation, format string, or OOB write) and need to convert it into code execution by targeting GOT, hooks, _IO_FILE vtable, exit_funcs, TLS_dtor_list, modprobe_path, .fini_array, or C++ vtables. | — |
| `auth-sec` | Entry P1 category router for authentication and authorization. Use when testing login flows, sessions, object authorization, JWT, OAuth, CORS, CSRF, and enterprise SSO weaknesses before any deeper auth topic skill. | — |
| `authbypass-authentication-flaws` | Authentication bypass testing playbook. Use when assessing login flows, password reset logic, account recovery, MFA bypass, token predictability, brute-force resistance, and session boundary flaws. | — |
| `binary-protection-bypass` | Binary protection bypass playbook. Use when identifying and bypassing ASLR, PIE, NX/DEP, stack canary, RELRO, FORTIFY_SOURCE, CET, and MTE protections in ELF binaries to enable exploitation. | PROTECTION_BYPASS_MATRIX.md |
| `browser-exploitation-v8` | Browser and V8 exploitation playbook. Use when exploiting JavaScript engine vulnerabilities including JIT type confusion, incorrect bounds elimination, and V8 sandbox bypass to achieve renderer RCE and sandbox escape in Chrome/Chromium. | V8_EXPLOITATION_PATTERNS.md |
| `business-logic-vuln` | Entry P1 category router for business logic testing. Use when workflow abuse, race conditions, pricing flaws, or multi-step state attacks matter more than parser-level input injection. | — |
| `business-logic-vulnerabilities` | Business logic vulnerability playbook. Use when reasoning about workflows, race conditions, price manipulation, coupon abuse, state machines, and multi-step authorization gaps. | CHECKLIST.md、METHODOLOGY.md、SCENARIOS.md |
| `classical-cipher-analysis` | Classical cipher analysis playbook. Use when encountering substitution ciphers, Vigenere, transposition, XOR, or encoded text in CTF challenges that requires frequency analysis, Kasiski examination, or known-plaintext cryptanalysis. | — |
| `clickjacking` | Clickjacking playbook. Use when testing whether target pages can be framed, whether X-Frame-Options or CSP frame-ancestors are properly configured, and whether UI redress attacks can trigger sensitive actions. | — |
| `cmdi-command-injection` | Command injection playbook. Use when user input may reach shell commands, process execution, converters, import pipelines, or blind out-of-band command sinks. | — |
| `code-obfuscation-deobfuscation` | Code obfuscation analysis and deobfuscation playbook. Use when reversing binaries protected by junk code, opaque predicates, self-modifying code, control flow flattening, VM protection, or string encryption. | — |
| `container-escape-techniques` | Container escape playbook. Use when operating inside a Docker container, LXC, or Kubernetes pod and need to escape to the host via privileged mode, capabilities, Docker socket, cgroup abuse, namespace tricks, or runtime vulnerabilities. | DOCKER_ESCAPE_CHAINS.md |
| `cors-cross-origin-misconfiguration` | CORS misconfiguration testing playbook. Use when analyzing cross-origin trust, credentialed browser reads, origin reflection, preflight policy bugs, and browser-based access to authenticated APIs. | SCENARIOS.md |
| `crlf-injection` | CRLF injection playbook. Use when user input reaches HTTP response headers, Location redirects, Set-Cookie values, or log files where carriage-return/line-feed characters can split or inject content. | — |
| `csp-bypass-advanced` | Advanced Content Security Policy bypass techniques. Use when XSS or data exfiltration is blocked by CSP and you need to find policy weaknesses, trusted endpoint abuse, nonce leakage, or exfiltration channels that CSP cannot block. | — |
| `csrf-cross-site-request-forgery` | CSRF testing playbook. Use when reviewing state-changing web flows, anti-CSRF defenses, SameSite behavior, JSON CSRF, login CSRF, and OAuth state handling. | — |
| `csv-formula-injection` | CSV/spreadsheet formula injection (DDE, Excel/LibreOffice, Google Sheets IMPORT*). Use when exports, imports, or user fields feed spreadsheets or reporting tools. | — |
| `dangling-markup-injection` | Dangling markup injection playbook. Use when HTML injection is possible but JavaScript execution is blocked (CSP, sanitizer strips event handlers, WAF blocks script tags) — exfiltrate CSRF tokens, session data, and page content by injecting unclosed HTML tags that capture subsequent page content. | — |
| `defi-attack-patterns` | DeFi attack pattern playbook. Use when analyzing flash loan attacks, price oracle manipulation, MEV sandwich attacks, governance exploits, bridge vulnerabilities, and token standard edge cases in decentralized finance protocols. | — |
| `dependency-confusion` | Supply-chain testing via package-manager dependency confusion: when internal package names resolve to attacker-controlled public registries, leading to malicious install and script execution. Use for npm/pip/gem/Maven/Composer/Docker manifest review and authorized red-team supply-chain exercises. | — |
| `deserialization-insecure` | Insecure deserialization playbook. Use when Java, PHP, or Python applications deserialize untrusted data via ObjectInputStream, unserialize, pickle, or similar mechanisms that may lead to RCE, file access, or privilege escalation. | JAVA_GADGET_CHAINS.md |
| `dns-rebinding-attacks` | DNS rebinding attack playbook. Use when testing applications that trust DNS resolution for origin checks, interact with internal services from browser context, or when SSRF is not possible server-side but the target has client-side fetch/XHR to attacker-controlled domains. | — |
| `email-header-injection` | Email header injection and spoofing playbook. Use when testing contact forms, email APIs, password reset flows, or any feature that constructs SMTP messages with user-controlled fields. Covers CRLF injection in headers, SPF/DKIM/DMARC bypass, and phishing amplification. | — |
| `expression-language-injection` | Expression Language injection playbook. Use when Java EL, SpEL, OGNL, or MVEL expressions may evaluate attacker-controlled input in Spring, Struts2, Confluence, or similar frameworks. | — |
| `file-access-vuln` | Entry P1 category router for file access and upload workflows. Use when testing download endpoints, file paths, local file inclusion, upload flows, preview pipelines, archive extraction, or storage and sharing boundaries. | — |
| `format-string-exploitation` | Format string exploitation playbook. Use when printf-family functions receive user-controlled format strings, enabling arbitrary stack reads (%p/%s), arbitrary memory writes (%n/%hn/%hhn), GOT/hook overwrites, and canary/libc/PIE leaks. | — |
| `ghost-bits-cast-attack` | Java "Ghost Bits" / Cast Attack playbook (Black Hat Asia 2026). Use when attacking Java services where 16-bit char is silently narrowed to 8-bit byte to bypass WAF/IDS for SQL injection, deserialization RCE, file upload (Webshell), path traversal, CRLF injection, request smuggling, and SMTP injection. Affects Tomcat, Spring, Jetty, Undertow, Vert.x, Jackson, Fastjson, Apache Commons BCEL, Apache HttpClient, Angus Mail, JDK HttpServer, Lettuce, Jodd, XMLWriter and re-enables many "patched" CVEs through WAF bypass. | PAYLOAD_COOKBOOK.md |
| `graphql-and-hidden-parameters` | GraphQL and hidden parameter testing playbook. Use when exploring introspection, batching, undocumented fields, hidden parameters, schema abuse, and GraphQL authorization gaps. | — |
| `hack` | Entry P0 primary router for HackSkills. Use when the task involves web application testing, API security assessment, recon, vulnerability triage, exploit path planning, or choosing the right next category skill before any deep topic skill. | — |
| `hash-attack-techniques` | Hash attack playbook. Use when exploiting length extension, MD5/SHA1 collisions, HMAC timing leaks, birthday attacks, or hash-based proof of work in CTF and authorized testing scenarios. | — |
| `heap-exploitation` | Heap exploitation playbook. Use when targeting ptmalloc2/glibc heap vulnerabilities including UAF, double free, overflow, off-by-one/null, and leveraging tcache/fastbin/unsortedbin attacks for arbitrary write or code execution. | HOUSE_OF_TECHNIQUES.md、IO_FILE_EXPLOITATION.md |
| `http-host-header-attacks` | HTTP Host header injection and routing abuse playbook. Use when the application trusts the Host header for generating URLs, routing requests, or access control — enabling password reset poisoning, web cache poisoning, SSRF via routing, and virtual host bypass. | — |
| `http-parameter-pollution` | HTTP Parameter Pollution (HPP): duplicate query/body keys parsed differently by servers, proxies, WAFs, and app frameworks. Use when filters and application layers disagree on which value wins, enabling bypass, SSRF second URL, logic abuse, or CSRF token confusion. | — |
| `http2-specific-attacks` | HTTP/2 protocol-specific attack playbook. Use when the target supports HTTP/2 and you need to exploit binary framing, HPACK compression, h2c upgrade smuggling, pseudo-header injection, stream multiplexing abuse, or H2→H1 downgrade translation flaws. | — |
| `idor-broken-object-authorization` | IDOR and broken object authorization testing playbook. Use when requests expose object identifiers, tenant boundaries, writable fields, or missing object-level authorization checks. | — |
| `injection-checking` | Entry P1 category router for injection testing. Use when routing between XSS, SQLi, SSRF, XXE, SSTI, command injection, and NoSQL injection workflows based on how attacker-controlled input is consumed. | EXTRA_INJECTION_TYPES.md |
| `insecure-source-code-management` | Source control and artifact exposure (.git, .svn, .hg, backups, .env). Use when recon finds VCS paths, 403 on hidden dirs, or backup/config leaks during authorized testing. | — |
| `ios-pentesting-tricks` | iOS pentesting playbook. Use when testing iOS applications for keychain extraction, URL scheme hijacking, Universal Links exploitation, runtime manipulation, binary protection analysis, data storage issues, and transport security bypass during authorized mobile security assessments. | IOS_RUNTIME_TRICKS.md |
| `jndi-injection` | JNDI injection playbook. Use when Java applications perform JNDI lookups with attacker-controlled names, especially via Log4j2, Spring, or any code path reaching InitialContext.lookup(). | — |
| `jwt-oauth-token-attacks` | JWT and OAuth token attack playbook. Use when validating token trust, signing algorithms, key handling, claim abuse, bearer flows, and OAuth account-binding weaknesses. | — |
| `kernel-exploitation` | Linux kernel exploitation playbook. Use when exploiting kernel vulnerabilities (UAF, OOB, race condition, type confusion) for privilege escalation via commit_creds, modprobe_path overwrite, or kernel ROP chains in CTF and real-world scenarios. | KERNEL_HEAP_TECHNIQUES.md、KERNEL_MITIGATION_BYPASS.md |
| `kubernetes-pentesting` | Kubernetes penetration testing playbook. Use when targeting Kubernetes clusters via API server, RBAC enumeration, service account abuse, etcd access, Kubelet API, pod escape, cloud-specific metadata, admission webhook bypass, and registry secrets. | — |
| `lattice-crypto-attacks` | Lattice-based cryptanalysis playbook. Use when attacking RSA via Coppersmith small roots, recovering DSA/ECDSA nonces from bias, solving knapsack problems, or applying LLL/BKZ reduction to cryptographic constructions. | — |
| `linux-lateral-movement` | Linux lateral movement playbook. Use after gaining initial access to pivot across Linux hosts via SSH hijacking, credential harvesting, internal pivoting, D-Bus exploitation, sudo token reuse, and shared filesystem abuse. | — |
| `linux-privilege-escalation` | Linux privilege escalation playbook. Use when you have low-privilege shell access and need to escalate to root via SUID/SGID binaries, capabilities, cron abuse, kernel exploits, misconfigurations, or credential harvesting on Linux systems. | KERNEL_EXPLOITS_CHECKLIST.md、SUID_CAPABILITIES_TRICKS.md |
| `linux-security-bypass` | Linux security mechanism bypass playbook. Use when facing restricted bash/rbash, read-only or noexec filesystems, AppArmor, SELinux, seccomp filters, or audit logging that must be evaded during post-exploitation. | — |
| `llm-prompt-injection` | LLM prompt injection playbook. Use when testing AI/LLM applications for direct injection, indirect injection via RAG/browsing, tool abuse, data exfiltration, MCP security risks, and defense bypass techniques. | JAILBREAK_PATTERNS.md |
| `macos-process-injection` | macOS process injection playbook. Use when you need to inject code into running or launching macOS processes via dylib hijacking, DYLD environment variables, XPC exploitation, Mach port manipulation, or Electron/Chromium abuse. | DYLIB_XPC_TECHNIQUES.md |
| `macos-security-bypass` | macOS security bypass playbook. Use when targeting macOS endpoints and need to bypass TCC, Gatekeeper, SIP, sandbox, code signing, or entitlement-based protections during authorized red team or pentest engagements. | TCC_BYPASS_MATRIX.md |
| `memory-forensics-volatility` | Memory forensics playbook using Volatility 2/3. Use when analyzing memory dumps for malware analysis, credential extraction, process investigation, code injection detection, and incident response timeline reconstruction. | VOLATILITY_CHEATSHEET.md |
| `mobile-ssl-pinning-bypass` | Mobile SSL pinning bypass playbook. Use when intercepting HTTPS traffic from mobile applications that implement certificate pinning, public key pinning, or SPKI hash pinning on Android and iOS, including React Native, Flutter, and Xamarin frameworks. | — |
| `network-protocol-attacks` | Network protocol attack playbook. Use when exploiting layer 2/3 protocols including ARP spoofing, LLMNR/NBT-NS/mDNS poisoning, WPAD abuse, DHCPv6 attacks, VLAN hopping, STP manipulation, DNS spoofing, IPv6 attacks, and IDS/IPS evasion. | NAME_RESOLUTION_POISONING.md |
| `nosql-injection` | NoSQL injection playbook. Use when MongoDB-style operators, JSON query objects, flexible search filters, or backend query DSLs may allow data or logic abuse. | — |
| `ntlm-relay-coercion` | NTLM relay and authentication coercion playbook. Use when capturing and relaying NTLM authentication to escalate privileges via SMB, LDAP, HTTP, or MSSQL relay targets, combined with PetitPotam, PrinterBug, and other coercion methods. | COERCION_METHODS.md |
| `oauth-oidc-misconfiguration` | OAuth and OIDC misconfiguration testing playbook. Use when reviewing redirect URI handling, state and nonce validation, PKCE, token audience, callback binding, and identity-provider trust flaws. | — |
| `open-redirect` | Open redirect playbook. Use when URL parameters, form actions, or JavaScript sinks control navigation targets and may redirect users to attacker-controlled destinations. | — |
| `path-traversal-lfi` | Path traversal and LFI playbook. Use when file paths, download endpoints, include operations, archive extraction, or wrapper behavior may expose filesystem control. | — |
| `prototype-pollution` | Prototype pollution testing for JavaScript stacks. Use when user input is merged into objects (query parsers, JSON bodies, deep assign), when configuring libraries via untrusted keys, or when hunting RCE gadgets via polluted Object.prototype in Node or the browser. | — |
| `prototype-pollution-advanced` | Advanced prototype pollution playbook — server-side RCE, client-side gadgets, filter bypasses, and detection techniques. Companion to ../prototype-pollution/ for basics. Use when you've confirmed pollution and need to escalate to code execution or find framework-specific gadgets. | KNOWN_GADGETS.md |
| `race-condition` | Race condition and TOCTOU testing for web apps. Use when testing one-time operations, concurrent HTTP abuse, rate-limit bypass, Turbo Intruder gates, HTTP/2 single-packet attacks, and CWE-362-style synchronization gaps. | — |
| `recon-and-methodology` | Reconnaissance and methodology playbook. Use when mapping assets, discovering endpoints, fingerprinting technology, and building a structured testing plan for a new target. | — |
| `recon-for-sec` | Entry P1 category router for reconnaissance and methodology. Use when mapping scope, discovering assets, fingerprinting technology, building endpoint inventory, and choosing the first high-value security testing path. | — |
| `request-smuggling` | HTTP request smuggling and desynchronization testing. Use when front proxies, CDNs, or load balancers disagree with the origin on message framing (Content-Length vs Transfer-Encoding), on HTTP/2→HTTP/1 translation, or when exploring client-side desync via browser fetch pipelines. | H2_SMUGGLING_VARIANTS.md |
| `reverse-shell-techniques` | Reverse shell techniques playbook. Use when establishing remote shells including language one-liners, encrypted shells (OpenSSL/socat/ncat), web shells, PTY upgrades, file transfer methods, PowerShell shells, and Windows payload generation. | SHELL_CHEATSHEET.md |
| `rsa-attack-techniques` | RSA attack playbook for CTF and real-world cryptanalysis. Use when given RSA parameters (n, e, c) and need to recover plaintext by exploiting weak keys, small exponents, shared factors, or padding oracles. | RSA_ATTACK_CATALOG.md |
| `saml-sso-assertion-attacks` | SAML SSO assertion attack playbook. Use when testing signature validation, assertion wrapping, audience restrictions, ACS handling, XML trust boundaries, and enterprise SSO flaws. | — |
| `sandbox-escape-techniques` | Sandbox escape playbook. Use when breaking out of Python sandbox, Lua sandbox, seccomp filter, chroot jail, container/Docker, browser sandbox, or namespace isolation to achieve unrestricted code execution or file access. | PYTHON_SANDBOX_ESCAPE.md、SECCOMP_BYPASS.md |
| `smart-contract-vulnerabilities` | Smart contract vulnerability playbook. Use when auditing Solidity/EVM contracts for reentrancy, integer overflow, access control, delegatecall, flash loan, signature replay, and MEV-related attack patterns. | SOLIDITY_VULN_PATTERNS.md |
| `sqli-sql-injection` | SQL injection playbook. Use when input reaches SQL queries, authentication logic, sorting, filtering, reporting, or DB-specific blind and out-of-band execution paths. | SCENARIOS.md、SQLMAP_ADVANCED.md |
| `ssrf-server-side-request-forgery` | SSRF playbook. Use when the server fetches URLs, resolves hostnames, imports remote content, or can be driven toward internal networks, cloud metadata, or secondary protocols. | SCENARIOS.md、URL_PARSER_TRICKS.md |
| `ssti-server-side-template-injection` | SSTI playbook. Use when template expressions, server-side rendering, preview features, or templating engines may evaluate attacker-controlled content. | ENGINE_PAYLOADS.md、SCENARIOS.md |
| `stack-overflow-and-rop` | Stack overflow and ROP playbook. Use when exploiting buffer overflows to hijack control flow via return address overwrite, ROP chains, ret2libc, ret2csu, ret2dlresolve, or SROP on Linux userland binaries. | ROP_ADVANCED_TECHNIQUES.md |
| `steganography-techniques` | Steganography detection and extraction playbook. Use when analyzing images (LSB, PNG chunks, JPEG DCT, EXIF), audio (spectrogram, DTMF), files (polyglots, appended data, ADS), and text (whitespace, zero-width, homoglyphs) for hidden data. | STEGO_TOOLS_GUIDE.md |
| `subdomain-takeover` | Subdomain takeover detection and exploitation playbook. Use when targets have dangling CNAME/NS/MX records pointing to deprovisioned cloud resources, expired third-party services, or unclaimed SaaS tenants that an attacker can register to serve content under the victim's domain. | — |
| `symbolic-execution-tools` | Symbolic execution and constraint solving playbook. Use when solving CTF reversing challenges, recovering keys, bypassing checks, or automating binary analysis with angr, Z3, or Unicorn Engine. | ANGR_COOKBOOK.md |
| `symmetric-cipher-attacks` | Symmetric cipher attack playbook. Use when exploiting block cipher mode weaknesses (CBC padding oracle, ECB cut-and-paste, bit flipping), stream cipher key reuse, or meet-in-the-middle attacks. | BLOCK_CIPHER_ATTACKS.md |
| `traffic-analysis-pcap` | Traffic analysis and PCAP forensics playbook. Use when analyzing network captures including Wireshark filters, protocol analysis (HTTP/DNS/FTP/SMTP/USB/WiFi), data extraction, covert channel detection, PCAP repair, TLS decryption, and tshark command-line analysis. | — |
| `tunneling-and-pivoting` | Tunneling and pivoting playbook. Use when establishing network tunnels through compromised hosts including SSH tunneling, Chisel, Ligolo-ng, socat, DNS/ICMP/HTTP tunneling, ProxyChains, and multi-layer pivoting strategies. | — |
| `type-juggling` | PHP type juggling and weak comparison (`==`) bypass. Use when authentication, HMAC/signature checks, or token validation uses loose equality, numeric coercion, or hash comparisons without strict types — common in legacy PHP and CTF-style code paths. | — |
| `unauthorized-access-common-services` | Unauthorized access playbook for common exposed services. Use when Redis, Rsync, PHP-FPM, AJP/Ghostcat, Hadoop YARN, H2 Console, or similar management interfaces are exposed without authentication. | PORT_SERVICE_MATRIX.md |
| `upload-insecure-files` | Insecure file upload playbook. Use when testing upload validation, storage paths, processing pipelines, preview behavior, overwrite risks, and upload-to-RCE chains. | SCENARIOS.md |
| `vm-and-bytecode-reverse` | Custom VM and bytecode reverse engineering playbook. Use when CTF challenges or protected software implement custom virtual machines with proprietary bytecode, dispatcher loops, or maze-style challenges. | — |
| `waf-bypass-techniques` | WAF bypass methodology and generic evasion techniques. Use when a web application firewall blocks injection payloads (SQLi, XSS, RCE) and you need to craft bypasses using encoding, protocol-level tricks, or WAF-specific weaknesses. | WAF_PRODUCT_MATRIX.md |
| `web-cache-deception` | Web cache deception and poisoning playbook. Use when CDN, reverse proxy, or application caching may serve sensitive authenticated content to other users due to path confusion or cache key manipulation. | CACHE_POISONING_TECHNIQUES.md |
| `websocket-security` | WebSocket handshake, CSWSH, tooling (wsrepl, ws-harness, Burp), and common flaws. Use when apps use real-time channels, chat, notifications, or WS-backed APIs. | — |
| `windows-av-evasion` | AV/EDR evasion playbook for Windows. Use when bypassing AMSI, ETW, .NET assembly detection, shellcode execution, process injection, API hooking, and signature-based detection on Windows endpoints. | AMSI_BYPASS_TECHNIQUES.md |
| `windows-lateral-movement` | Windows lateral movement playbook. Use when pivoting between Windows hosts via PsExec, WMI, WinRM, DCOM, RDP, pass-the-hash, overpass-the-hash, or pass-the-ticket techniques. | CREDENTIAL_DUMPING.md |
| `windows-privilege-escalation` | Windows local privilege escalation playbook. Use when you have low-privilege shell access on Windows and need to escalate via token abuse, Potato exploits, service misconfigurations, DLL hijacking, UAC bypass, or registry autoruns. | TOKEN_POTATO_TRICKS.md、UAC_BYPASS_METHODS.md |
| `xslt-injection` | XSLT injection testing: processor fingerprinting, XXE and document() SSRF, EXSLT write primitives, PHP/Java/.NET extension RCE surfaces. Use when user-controlled XSLT/stylesheet input or transform endpoints are in scope. | — |
| `xss-cross-site-scripting` | XSS playbook. Use when user-controlled content reaches HTML, attributes, JavaScript, DOM sinks, uploads, or multi-context rendering paths. | ADVANCED_XSS_TRICKS.md、SCENARIOS.md |
| `xxe-xml-external-entity` | XXE playbook. Use when XML, SVG, OOXML, SOAP, or parser-driven imports may resolve external entities, files, or internal network resources. | SCENARIOS.md |

## 二、CLI 子命令

在**内置根目录**内执行 `python main.py <command> ...`；`python main.py --help` 列出全部用法。

| 命令 | 说明 |
| --- | --- |
| `auth-bypass` | 认证绕过检测 |
| `auth-cookie-tamper` | Cookie篡改检测 |
| `auth-default-creds` | 默认凭证检测 |
| `auth-header-injection` | HTTP首部注入检测 |
| `auth-mass-assignment` | 批量赋值检测 |
| `auth-method-bypass` | HTTP方法绕过检测 |
| `auto` | 全自动渗透(信息收集+攻击面+检测+链式利用) |
| `autohunt` | 自动狩猎(爬虫+参数挖掘+检测+武器化) |
| `batch-recon` | 批量资产发现(端口+Web指纹+高价值排序) |
| `binary-scan` | 二进制文件分析(PE/ELF) |
| `bizlogic` | 深度业务逻辑漏洞挖掘(2FA/价格/MassAssn/逻辑) |
| `bizlogic-v2` | 业务逻辑v2检测(深度状态分析) |
| `capture` | 环境感知数据包捕获(Kali tcpdump / 本地) |
| `chain` | 利用链组合攻击 |
| `chain-sqli-auth` | SQLi→Auth链式利用验证 |
| `chain-sqli-lfi` | SQLi→LFI链式利用验证 |
| `chain-ssrf-lfi` | SSRF→LFI链式利用验证 |
| `clickjacking` | Clickjacking检测 |
| `cloud-pwn` | 云凭据利用 (AWS/GCP/Azure) |
| `cmdi` | 命令注入检测 |
| `cms-fingerprint` | CMS版本指纹+已知漏洞映射(74cms等) |
| `code-audit` | 源代码审计(静态分析) |
| `constraint` | 约束图分析(BL转储) |
| `cors` | CORS检测 |
| `crawl` | 网页爬虫 |
| `crlf-injection` | CRLF注入检测 |
| `csrf` | CSRF检测与绕过 |
| `deepscan` | 深度扫描(爬虫+检测+报告) |
| `deser` | 反序列化检测 |
| `deser-weaponize` | 反序列化payload生成 |
| `deviation` | 偏差检测(异常响应分析) |
| `dirfuzz` | 目录枚举 |
| `dom-xss` | DOM XSS检测(静态分析sink/source配对) |
| `domain` | 域渗透审计 (LDAP/Kerberos/SMB/ADCS) |
| `file-upload` | 文件上传漏洞检测 |
| `fuzz` | 模糊测试 |
| `fuzz-engine` | 高级语法模糊测试(grammar-based) |
| `graphql` | GraphQL扫描 |
| `graphql-abuse` | GraphQL高级利用(内省/批量/深度) |
| `hpp` | HTTP参数污染检测 |
| `idor` | 水平越权/未授权访问检测(SRC最高频) |
| `jwt` | JWT检测 |
| `jwt-attack` | JWT攻击(算法混淆/弱密钥/注入) |
| `jwt-exploit` | JWT利用(crack/伪造) |
| `kali` | Kali Linux 工具调用 (需配置 --kali-host/--kali-local) |
| `leak-scan` | 信息泄露专项扫描(.git/.env/备份/Swagger/actuator) |
| `lfi` | 本地文件包含检测 |
| `list` | 列出所有可用工具 |
| `login` | SRC工作流: 登录并保存session文件(供--session-file复用) |
| `mobile-scan` | 移动应用安全扫描(APK/IPA) |
| `nosqli` | NoSQL注入检测 |
| `open-redirect` | 开放重定向检测 |
| `param-mine` | 参数挖掘 |
| `payload-mutate` | Payload变异 |
| `portscan` | TCP端口扫描 |
| `proto-pollution` | 原型链污染检测 |
| `proxy` | MITM代理(请求/响应捕获+检测) |
| `quickscan` | 快速扫描(极速发现高危漏洞) |
| `race` | 竞争条件检测 |
| `race-profile` | 竞争条件探测器(自动分析) |
| `recon` | 全面信息收集(指纹/端口/git/目录) |
| `reverse-shell` | 反弹Shell生成器 |
| `saml-sso` | SAML SSO漏洞检测 |
| `smuggle` | HTTP请求走私检测 |
| `smuggler` | HTTP请求走私检测 (CL.TE/TE.CL/TE.TE/h2c) |
| `sqlcheck` | SQL注入检测 |
| `sqli-blind` | SQL盲注利用 |
| `sqli-oob` | OOB SQL注入 |
| `sqli-second-order` | 二阶SQL注入检测(存储后触发) |
| `sqli-weaponize` | SQL注入数据提取 |
| `ssrf` | SSRF检测 |
| `ssrf-lateral` | SSRF横向移动 |
| `ssrf-pwn` | SSRF文件读取与云元数据 |
| `ssti` | 模板注入检测 |
| `unauth` | 未授权中间件检测(Redis/ES/Mongo/MySQL/Postgres) |
| `verify` | 第二序交叉验证(多方法确认) |
| `waf` | WAF指纹识别与绕过 |
| `waf-heavy` | WAF严格绕过注入检测(HPP/分块/Unicode/注释嵌套) |
| `weakpass` | 业务系统弱口令/默认凭据检测(低频差分) |
| `web-cache` | Web缓存反解/投毒检测 |
| `webshell` | Webshell生成与部署 |
| `workflow` | 工作流执行 |
| `workflow-trace` | 工作流追踪(业务逻辑流分析) |
| `xss-validate` | XSS验证 |
| `xss-verify` | 浏览器级XSS验证 |
| `xsscheck` | XSS检测 |
| `xxe` | XXE XML外部实体检测 |

### kali 组内子命令（`main.py --kali-host <host> kali <sub>`，共 14 个）

| 子命令 | 说明 |
| --- | --- |
| `autoexploit` | 根据漏洞类型自动选择 Kali 工具利用 |
| `connect` | 测试 Kali 连接并检测工具 |
| `exec` | 在 Kali 上执行任意命令 |
| `ffuf` | ffuf 目录/文件枚举 |
| `gobuster` | gobuster 目录爆破 |
| `hydra` | hydra 暴力破解 |
| `list-tools` | 列出 Kali 上可用的工具 |
| `msfconsole` | metasploit 漏洞利用 |
| `nikto` | nikto Web 服务器扫描 |
| `nmap` | nmap 端口扫描 |
| `nuclei` | nuclei 漏洞模板扫描 |
| `sqlmap` | sqlmap SQL 注入检测与利用 |
| `whatweb` | whatweb 指纹识别 |
| `wpscan` | wpscan WordPress 漏洞扫描 |

## 三、Python 工具模块与运行环境

内置根下的 `tools/` 每个模块导出可直接 import 的检查函数（多数为 `check(...)`），返回结构化字典，便于脚本化编排。共 136 个：

`_context` · `_enrich` · `_finding` · `_session` · `active_prober` · `adaptive_fuzzer` · `adaptive_payload` · `ai_vuln_hunter` · `attack_graph` · `attack_surface` · `attack_tree` · `auth_bypass` · `auth_engine` · `auth_state_machine` · `auto_pwn` · `batch_recon` · `binary_analyzer` · `binary_search` · `biz_logic_scanner` · `biz_logic_v2` · `c2_beacon` · `chain_engine` · `clickjacking` · `cloud_pwn` · `cmdi_detector` · `cms_fingerprint` · `code_audit` · `constraint_graph` · `context_memory` · `cors_scanner` · `crawler` · `crlf_injection` · `cross_validator` · `csrf_scanner` · `db_lateral` · `deser_weaponizer` · `deserialization_detector` · `deviation_oracle` · `dom_xss` · `domain_attacks` · `domain_hunt` · `dual_session` · `evasion_engine` · `exceptions` · `false_positive_filter` · `file_upload` · `fuzz_engine` · `graphql_abuser` · `graphql_scanner` · `hpp` · `html_context_parser` · `http_client` · `idor_scanner` · `interactive_shell` · `internal_scan` · `jwt_attacker` · `jwt_detector` · `jwt_exploiter` · `kali_capture` · `kali_executor` · `kali_toolset` · `knowledge_graph` · `lateral_move` · `leak_scanner` · `lfi_scanner` · `log_utils` · `mitm_proxy` · `mobile_scanner` · `mode` · `nosqli_detector` · `oob_server` · `open_redirect` · `opsec_session` · `orchestrator` · `packet_capture` · `param_classifier` · `param_miner` · `payload_engine` · `payload_mutator` · `pipeline` · `playwright_auth` · `playwright_engine` · `post_exploit` · `proto_pollution` · `protocol_fuzzer` · `proxy_pool` · `race_condition` · `race_profiler` · `reasoning_engine` · `reporter` · `responder_kit` · `response_analyzer` · `response_profiler` · `retry` · `reverse_shell` · `robust_verifier` · `saml_sso` · `second_order_sqli` · `second_order_verifier` · `semantic_analyzer` · `semantic_diff` · `service_mapping` · `session_matrix` · `settings` · `smart_fuzzer` · `smb_lateral` · `smuggler` · `spa_crawler` · `sql_injection` · `sqli_adapter` · `sqli_blind` · `sqli_oob` · `sqli_weaponizer` · `src_report` · `ssrf_chain` · `ssrf_detector` · `ssrf_pwn` · `ssti_detector` · `storage` · `tool_registry` · `tunnel_agent` · `type_confusion` · `unauth_scan` · `verification_oracle` · `version_fingerprint` · `vuln_context` · `waf_bypass` · `weakpass` · `weaponize_engine` · `web_cache` · `workflow` · `workflow_tracer` · `xss_browser_verify` · `xss_detector` · `xss_validator` · `xxe_detector`

运行 CLI 前先装依赖（`requirements.txt`）：`requests` / `beautifulsoup4` / `PyJWT` / `cryptography`；
`playwright install chromium` 仅在 SPA 爬虫与浏览器级 XSS 验证时需要。

其余内置资源：`payload_seeds/*.yml`（按漏洞类别的 payload 种子）、`engine/`（阈值与判定引擎）、
`docs/`（方法论文档：`vuln_playbooks.md` / `src_hunting.md` / `tool_guide.md` / `report_writing.md` 等）、
`data/src_targets.txt`（SRC 目标清单）、`tests/`（220+ 单测，可作为各模块 API 的用法示例）。

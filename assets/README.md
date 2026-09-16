# assets/ —— 内置资源

本目录存放随 npm 包一起分发的内置资源。它们**不是**构建产物，只被 `src/aimy.ts`
按插件自身模块位置解析后渲染进 `aimy-skill` 策略的系统块。

| 路径 | 说明 | 修改权限 |
|------|------|----------|
| `aimy-skill/` | 上游 [Prohao42/aimy-skill](https://github.com/Prohao42/aimy-skill) 的**逐字节副本**（441 个文件，不含 `.git`） | **只读**：请勿手工编辑 |
| `aimy-skill-index.md` | 由 `aimy-skill/` 树生成的资源索引（102 技能 / 136 模块 / 87 CLI 命令） | 生成物，随上游更新重生成 |

## 来源与可核对性

- 上游：<https://github.com/Prohao42/aimy-skill>
- 版本：3.7.0
- commit：`0c56eb161a10ce5fdea103cf8b92ced9a8f51e66`
- 许可证：MIT（副本见 `aimy-skill/ai-mian/hack-skills/LICENSE`）

`aimy-skill/` 下的每个文件都与上述 commit 的 git blob **逐字节一致**（含行尾）。
因此：

- 不要在本目录内格式化、改行尾或转码——`.gitattributes` 已为 `assets/aimy-skill/**`
  关闭了 text/eol/encoding 转换，任何改动都会破坏一致性保证。
- 升级上游时按 `STRATEGIES.md` 的「Re-vendoring」步骤整树替换，而不是逐文件补丁。

## 复核方法

```bash
# 与上游同一 commit 的 blob 哈希逐一比对（预期 441 个全部一致）
git clone --depth 1 https://github.com/Prohao42/aimy-skill.git /tmp/aimy-skill
git -C /tmp/aimy-skill ls-tree -r HEAD | while read mode type sha path; do
  local=$(git hash-object "assets/aimy-skill/$path")
  [ "$sha" = "$local" ] || echo "DIFF: $path"
done
```

计数一致性由 `tests/aimy.spec.ts` 断言：策略元数据与导出的 `AIMY_SKILL_*` 常量
必须与 `aimy-skill-index.md` 中记录的数量相同。

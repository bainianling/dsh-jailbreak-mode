# Strategy Reference

The package exports `JAILBREAK_STRATEGIES` and `BUILTIN_STRATEGY_COUNT`; consumers should read the count from the export instead of hardcoding a number in UI copy.

Each strategy can expose `version`, `source`, `category`, `tags`, `riskLevel`, and an optional `analysis` profile. Use `strategyMetadata(strategy)` to obtain the stable metadata view.

Strategies can be composed with `composeStrategies(['evaluator', 'reverse-engineering'])` or selected through `/jailbreak evaluator+reverse-engineering`. Composition is deterministic: system blocks and prefixes follow the listed order, while suffixes close in reverse order.

The `reverse-engineering` profile requires intake, static mapping, decompilation, data-flow tracing, one runtime check, and a report with Findings, Evidence, Reproduction, Change, Verification, and Rollback sections. Conclusions use `VERIFIED`, `CANDIDATE`, or `UNRESOLVED` labels.

Strategy selections are logged with optional `strategyVersion` and `strategySource` fields so replay and audit tools can identify the template revision used at the time.

## Two resource-backed strategies

Two strategies carry something other than prompt text alone. Both render their
resource into the `jailbreak:policy` system block and leave user messages
untouched, so neither changes the request shape beyond that section.

| Strategy | Carrier | Rendered by | Resource |
| --- | --- | --- | --- |
| `tvd-guard` | `strategy.tvd` | `renderTvdSystem` (`src/tvd.ts`) | Skeleton files scaffolded into the session workspace; the validator really runs |
| `aimy-skill` | `strategy.aimy` | `renderAimySkillSystem` (`src/aimy.ts`) | The aimy-skill toolkit vendored in `assets/aimy-skill/`; the model reads and runs it in place |

`aimy-skill` resolves its bundle from the plugin's own module URL, so the
rendered absolute path is install-relative and identical in every workspace.
`DSH_AIMY_SKILL_DIR` relocates the bundle (a checkout, or an unpacked copy).
The strategy's `category` is `security-toolkit`, and the exported
`AIMY_SKILL_SKILL_COUNT` / `AIMY_SKILL_TOOL_COUNT` / `AIMY_SKILL_COMMAND_COUNT`
constants are asserted against the generated `assets/aimy-skill-index.md`, which
is the one place those numbers come from.

## Automatic playbook selection

`aimy-skill` does not merely tell the model where the playbooks are; it selects
one per request. The step's own user text is scored against
`assets/aimy-skill-triggers.json` and a clear match has that `SKILL.md` injected
as instructions context, once per session, appended last.

The trigger index is generated data, so it never drifts from the vendored tree:

```bash
pnpm run generate:triggers   # node scripts/generate-aimy-triggers.mjs
```

Two rules keep routing precise, and both are enforced by the matcher in
`src/aimy-triggers.ts` rather than by the data alone:

- **A trigger must clear the threshold and be decisive.** One hit from a skill's
  full name or a curated alias (`sqli`, `sql注入`, `linux提权`) weighs 3 and
  routes by itself; single name fragments are weak and must accumulate.
- **A shared or class-noun trigger is never decisive.** `genericTriggers()`
  demotes any trigger listed by three or more skills (`api`, `auth`), plus a
  curated set of words that name a category rather than a technique (`type`,
  `path`, and function words that leak in from a skill name, such as `to` from
  `arbitrary-write-to-rce`). Demotion lowers the weight; it does not remove the
  skill from routing.

`aimyAutoSkills: false` turns selection off and leaves the prompt-only behavior,
which is also what any read or parse failure degrades to — a broken index never
fails a step.

Re-vendoring after an upstream release:

```bash
git clone --depth 1 https://github.com/Prohao42/aimy-skill.git /tmp/aimy-skill
git -C /tmp/aimy-skill -c core.autocrlf=false archive --format=tar HEAD -o /tmp/aimy.tar
rm -rf assets/aimy-skill && mkdir -p assets/aimy-skill
tar -xf /tmp/aimy.tar -C assets/aimy-skill
# Regenerate assets/aimy-skill-index.md from the new tree, then update the
# AIMY_SKILL_* constants and the strategy's `aimy` descriptor to match.
pnpm run generate:triggers
```

`-c core.autocrlf=false` is load-bearing on Windows: without it `git archive`
writes CRLF into the extracted files and the tree is no longer byte-identical to
the upstream blobs.

# Strategy Reference

The package exports `JAILBREAK_STRATEGIES` and `BUILTIN_STRATEGY_COUNT`; consumers should read the count from the export instead of hardcoding a number in UI copy.

Each strategy can expose `version`, `source`, `category`, `tags`, `riskLevel`, and an optional `analysis` profile. Use `strategyMetadata(strategy)` to obtain the stable metadata view.

Strategies can be composed with `composeStrategies(['evaluator', 'reverse-engineering'])` or selected through `/jailbreak evaluator+reverse-engineering`. Composition is deterministic: system blocks and prefixes follow the listed order, while suffixes close in reverse order.

The `reverse-engineering` profile requires intake, static mapping, decompilation, data-flow tracing, one runtime check, and a report with Findings, Evidence, Reproduction, Change, Verification, and Rollback sections. Conclusions use `VERIFIED`, `CANDIDATE`, or `UNRESOLVED` labels.

Strategy selections are logged with optional `strategyVersion` and `strategySource` fields so replay and audit tools can identify the template revision used at the time.

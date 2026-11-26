# 冒烟测试题

第一次真实运行时，建议先用一道答案已知、难度适中的题，加上 `economy` 预设和较小的预算，确认整条流程能走通，再去碰开放问题：

```text
/cogentic --preset economy --rounds 2 --provers 2 --budget 40 Prove that for every integer n ≥ 1, the number of partitions of n into distinct parts equals the number of partitions of n into odd parts.
```

预期结果：

1. Board 上依次出现 `lit-*`、`sum-r1-*`、`prov-r1-*`、`ver-r1-*`、`xver-r1`、`aud-r1`、`adv-r1`，接着是 `cmp`、`writer-1`、`faud-1`。
2. `.cogentic/<run_id>/` 下生成 `record.jsonl`，并且有 `final/manuscript.md`。
3. `cogentic_status` 显示 `phase: done`，`calls_used` 不超过 40。

论文附录 A 列出了作者实际用过的 5 道开放问题的原始提示词。如果要复现这 5 道题，请参照论文原文，并使用 `--preset faithful`。

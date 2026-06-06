# Rendered Sessions

This directory contains Markdown renderings of the raw Pi JSONL session files in
[`../sessions`](../sessions).

Naming convention:

```text
YYYY-MM-DD-<target>-<model>-<reasoning-setting>.md
```

Current renderings:

- [`2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md`](2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md)
- [`2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md`](2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md)

In these filenames, `low-thinking-budget-128` refers to the server-side
llama-server reasoning budget, not Pi's recorded `thinkingLevel` metadata.

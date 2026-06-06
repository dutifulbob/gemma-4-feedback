# Gemma 4 Feedback

This repository contains small reproduction cases for Gemma 4 12B
classification behavior under different reasoning settings.

In the original run, the model completed the task correctly in one shot, but
spent far more output tokens than the task required before calling the
structured `final_json` tool. A follow-up run used a bounded low reasoning
budget. That run was much faster, but the label quality regressed.

## Contents

- [`sessions/gemma-4-12b-localpager-reasoning-auto.jsonl`](sessions/gemma-4-12b-localpager-reasoning-auto.jsonl) - raw Pi JSONL session from the original unbounded/default-reasoning run.
- [`sessions/gemma-4-12b-localpager-low-thinking.jsonl`](sessions/gemma-4-12b-localpager-low-thinking.jsonl) - raw Pi JSONL session from the bounded low-thinking run.
- [`rendered-sessions/`](rendered-sessions/) - Markdown renderings of the raw Pi JSONL session files.
- [`analysis/generation-feedback.md`](analysis/generation-feedback.md) - what was not sensible about the generation and why it should have been shorter.
- [`analysis/low-thinking-comparison.md`](analysis/low-thinking-comparison.md) - comparison of the low-thinking run against the original run.
- [`analysis/environment-and-checkpoint.md`](analysis/environment-and-checkpoint.md) - inference engine, checkpoint, runtime, and hardware details.
- [`analysis/reproduction.md`](analysis/reproduction.md) - exact Localpager/localpager-agent commands and reproduction steps.
- [`data/run-summary.json`](data/run-summary.json) - compact run metadata and timing numbers.
- [`data/low-thinking-comparison.json`](data/low-thinking-comparison.json) - machine-readable comparison summary.
- [`data/environment-and-checkpoint.json`](data/environment-and-checkpoint.json) - machine-readable engine and checkpoint metadata.
- [`data/reproduction.json`](data/reproduction.json) - machine-readable reproduction metadata.

## Short Summary

The prompt asked for a single structured classification result. The relevant
evidence was already in the title and the first clear problem statement:

- Title: `fix(acp): preserve pre-tool text in final_only delivery mode`
- Prompt rule: pre-tool text preservation routes to `tool_calling`
- Title evidence: `fix(acp)` supports `acp`

Instead of making that direct decision, the model emitted a long reasoning trace
that repeatedly re-evaluated the same topic choices before calling the final
JSON tool.

Observed run:

- Prompt tokens: 6,981
- Generated tokens: 3,370
- Decode time: 157.9 seconds
- End-to-end wrapper time: 170 seconds
- Final result: `["acp", "tool_calling"]`

The final answer was defensible. The issue is the amount of reasoning used for a
straightforward routing decision.

Bounded low-thinking run:

- Prompt tokens: 6,978
- Generated tokens: 231
- Decode time: 10.65 seconds
- End-to-end wrapper time: 22 seconds
- Final result: `["reliability", "tool_calling"]`

The low-thinking run was about 7.7x faster end to end and used about 14.6x fewer
generated tokens, but it missed the title-level `acp` label and added the less
specific `reliability` label.

Engine and checkpoint:

- Engine: `llama-server` from `llama.cpp` version `9533` (`c4a278d68`)
- Backend: Vulkan on NVIDIA GB10
- Checkpoint: `google/gemma-4-12B-it-qat-q4_0-gguf`
- File: `gemma-4-12b-it-qat-q4_0.gguf`
- SHA-256: `faff1a63667fac17ac5e777f47114688fcefea96e220e211aaa8d62c2c4561f1`
- Served context: 32,768 tokens

Execution path:

- Both runs used Localpager's
  [`scripts/localpager-classifier`](https://github.com/osolmaz/localpager/blob/6cad649c665003a62a6397e32701ab5d4711c463/scripts/localpager-classifier).
- That wrapper invoked `localpager-agent` with `--final-schema`.
- `localpager-agent` package:
  [`@osolmaz/localpager-agent` version `0.1.0`](https://github.com/osolmaz/localpager/tree/6cad649c665003a62a6397e32701ab5d4711c463/localpager-agent).
- `localpager-agent` is Pi plus Localpager-specific setup, not a separate
  inference engine.
- `localpager-agent` launched Pi and required the `final_json` tool.
- No bash/repo-shell tool was available to the model in these runs.

## Viewing The Session

With Pi configured for a compatible local OpenAI-style endpoint, the session can
be opened directly:

```bash
npx -y @earendil-works/pi-coding-agent@latest \
  --provider local-openai \
  --model gemma-4-12b-it-qat-q4_0 \
  --thinking off \
  --session sessions/gemma-4-12b-localpager-reasoning-auto.jsonl
```

For the low-thinking session, use:

```bash
npx -y @earendil-works/pi-coding-agent@latest \
  --provider local-openai \
  --model gemma-4-12b-it-qat-q4_0 \
  --thinking low \
  --session sessions/gemma-4-12b-localpager-low-thinking.jsonl
```

The session file is plain JSONL. It can also be inspected with `jq`.

## Rendering Markdown

Regenerate a Markdown transcript from any Pi JSONL session with:

```bash
node scripts/render-session-jsonl.mjs \
  sessions/gemma-4-12b-localpager-reasoning-auto.jsonl \
  rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md
```

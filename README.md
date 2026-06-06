# Gemma 4 Feedback

This repository contains a small reproduction case for an unexpectedly long
Gemma 4 12B classification generation.

The model completed the task correctly in one shot, but spent far more output
tokens than the task required before calling the structured `final_json` tool.
The saved session is included so the behavior can be inspected directly.

## Contents

- [`sessions/gemma-4-12b-localpager-reasoning-auto.jsonl`](sessions/gemma-4-12b-localpager-reasoning-auto.jsonl) - raw Pi JSONL session from the run.
- [`analysis/generation-feedback.md`](analysis/generation-feedback.md) - what was not sensible about the generation and why it should have been shorter.
- [`data/run-summary.json`](data/run-summary.json) - compact run metadata and timing numbers.

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

The session file is plain JSONL. It can also be inspected with `jq`.

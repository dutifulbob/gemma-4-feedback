# Low-Thinking Comparison

## Summary

A follow-up run tested the same `openclaw/openclaw#84509` classification with
bounded low thinking.

The low-thinking run solved the latency problem but introduced a quality tradeoff:
it was much faster, yet it selected a less appropriate topic set.

## Runs Compared

| Run | Server reasoning setting | End-to-end time | Generated tokens | Final topics |
| --- | --- | ---: | ---: | --- |
| Original | Default/auto reasoning, effectively unbounded | 170s | 3,370 | `acp`, `tool_calling` |
| Low thinking | `--reasoning on --reasoning-budget 128` | 22s | 231 | `reliability`, `tool_calling` |

## What Improved

The bounded low-thinking run was substantially faster:

- End-to-end time dropped from 170 seconds to 22 seconds.
- Generated tokens dropped from 3,370 to 231.
- Decode time dropped from 157.92 seconds to 10.65 seconds.
- The model still called `final_json` in one assistant turn.
- There was still no bash/tool read and no retry.

This shows that a bounded reasoning budget can prevent the pathological
long-deliberation behavior.

## What Regressed

The final labels changed from:

```json
["acp", "tool_calling"]
```

to:

```json
["reliability", "tool_calling"]
```

The low-thinking answer is understandable, but worse for this prompt.

The title was:

```text
fix(acp): preserve pre-tool text in final_only delivery mode
```

The prompt also said that pre-tool text preservation maps to `tool_calling`.
A compact high-quality answer should therefore keep `acp` from the title and
`tool_calling` from the explicit tie-breaker.

The low-thinking run missed `acp` and added `reliability`, which is less
specific here. `reliability` is plausible because text was lost, but the prompt
asked for the smallest maintainer-routing set and gave a more specific
`tool_calling` rule for pre-tool text preservation.

## Reasoning Trace Difference

Original run:

- Reasoning block: 12,083 characters, 217 lines
- Repeatedly reconsidered the same labels
- Final topics: `acp`, `tool_calling`

Low-thinking run:

- Reasoning block: 400 characters, 10 lines
- The reasoning trace stopped while still listing PR metadata
- llama-server logged that the 128-token reasoning budget was exhausted and it
  forced the end-of-thinking sequence
- Final topics: `reliability`, `tool_calling`

So the low budget was strong enough to stop overthinking, but too tight for the
model to complete the useful part of the classification deliberation reliably.

## Takeaway

For this classifier, the useful target is probably not unbounded reasoning and
not a very small reasoning budget.

The best next setting to test would be either:

- `--reasoning off`, because this is a direct classification task with an
  explicit taxonomy and final schema
- `--reasoning on --reasoning-budget 512`, if some reasoning is desired without
  allowing thousands of generated tokens

The important behavior to preserve is: short output, one final tool call, and
the title-first `acp` label.

See [`environment-and-checkpoint.md`](environment-and-checkpoint.md) for the
exact inference engine version, checkpoint file, model hash, runtime command
lines, and host details.

See [`reproduction.md`](reproduction.md) for the exact Localpager/localpager-agent
commands used to run and view the sessions.

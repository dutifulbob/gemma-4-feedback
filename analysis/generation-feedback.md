# Generation Feedback

## Case

This is a local classification run for `openclaw/openclaw#84509` using Gemma 4
12B QAT Q4_0 through a local OpenAI-compatible server and Pi.

The task was to classify one GitHub pull request into a small set of allowed
notification topics and call the structured `final_json` tool.

The model did call `final_json` successfully on the first assistant turn. There
was no tool retry and no extra conversational output.

## What Happened

The saved session has this structure:

1. Session metadata
2. Model selection metadata
3. Thinking-level metadata: `off`
4. User prompt
5. Assistant message with one long `thinking` part and one `final_json` tool call
6. Tool result

The assistant message included:

- One reasoning block
- One final structured tool call
- No bash/tool reads
- No retry

The final tool payload was:

```json
{
  "topics_of_interest": ["acp", "tool_calling"],
  "description": "Fixes a bug in the ACP projector where pre-tool text was lost in `final_only` delivery mode by preserving accumulated state across intermediate `done` events.",
  "caveats": [
    "The provided GitHub context is truncated, but the relevant logic for the ACP projector and the fix for pre-tool text preservation is clearly described in the summary and diff sections."
  ]
}
```

That result is reasonable. The problem is the amount of reasoning generated to
arrive there.

## What Was Not Sensible

The task did not require a long chain of deliberation. The key routing evidence
was direct:

- The title starts with `fix(acp)`, which supports `acp`.
- The title and body are about preserving text before tool calls.
- The prompt explicitly says pre-tool text preservation routes to `tool_calling`.
- The provided GitHub context was already enough; no repository read was needed.
- The output schema was fixed and the model had a dedicated final JSON tool.

Instead, the reasoning trace:

- Performed a full negative scan over nearly every allowed topic.
- Revisited the same `acp` vs `tool_calling` vs `reliability` decision many times.
- Reconsidered `chat_integrations` several times even though the issue was not
  specific to Feishu or QQ Bot.
- Considered `reliability` repeatedly, then correctly omitted it.
- Repeated the same conclusion several times before calling `final_json`.

Trace counts from the reasoning block:

- Reasoning length: 12,083 characters
- Reasoning lines: 217
- Lines containing `Wait`: 11
- Lines restating a decision such as "stick with" or "use both": 8
- Mentions of `acp`: 36
- Mentions of `tool_calling`: 34
- Mentions of `reliability`: 13
- Mentions of `chat_integrations`: 13

The trace is mostly internally coherent, but it is inefficient and repetitive.

## Why It Should Have Been Shorter

This was not an open-ended reasoning task. It was a classification task with
clear title evidence, explicit tie-breakers, and a structured final tool.

A compact decision path would have been:

1. Title says `fix(acp)`, so include `acp`.
2. Problem is pre-tool text preservation, and the prompt maps that to
   `tool_calling`.
3. Do not add `notifications`, `chat_integrations`, or `reliability` because
   they are either downstream effects or less specific than the tie-breaker.
4. Call `final_json`.

At the measured decode speed, the long reasoning block dominated latency:

- Prompt processing: 6,981 tokens in 8.39 seconds
- Decode: 3,370 tokens in 157.92 seconds
- Decode throughput: 21.34 tokens/second
- End-to-end wrapper time: 170 seconds

If the model had used roughly 50-200 output tokens before the final tool call,
the same run would likely have taken about 11-18 seconds instead of 170 seconds:

- 50 output tokens at 21.34 tok/s: about 2.3 seconds decode
- 200 output tokens at 21.34 tok/s: about 9.4 seconds decode
- Add the observed 8.39 seconds of prompt processing

That is the core issue: the model reached a reasonable answer, but spent about
one to two orders of magnitude more generation than necessary for a direct
routing classification.

## Configuration Detail

Pi recorded `thinkingLevel: "off"` in the session metadata. The long reasoning
trace therefore did not come from Pi explicitly requesting thinking.

The run used a local server mode where Gemma reasoning was still enabled by the
server default. In later tests, starting the server with reasoning disabled
avoided this hidden long-deliberation path.

See [`environment-and-checkpoint.md`](environment-and-checkpoint.md) for the
exact inference engine version, checkpoint file, model hash, runtime command
lines, and host details.

See [`reproduction.md`](reproduction.md) for the exact Localpager/localpager-agent
commands used to run and view the session.

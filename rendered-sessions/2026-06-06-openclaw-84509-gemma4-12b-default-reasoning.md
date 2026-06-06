# 2026-06-06 OpenClaw 84509 Gemma 4 12B default reasoning

Rendered from a Pi JSONL session transcript.

## Metadata

| Field | Value |
| --- | --- |
| Source | sessions/gemma-4-12b-localpager-reasoning-auto.jsonl |
| Session id | 019e9da7-70dc-739e-8e45-1f4b9f16db41 |
| Started | 2026-06-06T15:57:36.860Z |
| Working directory | /home/bob/repos/localpager/localpager-agent |
| Provider | local-openai |
| Model | gemma-4-12b-it-qat-q4_0 |
| Pi thinking level | off |
| Prompt tokens | 6981 |
| Generated tokens | 3370 |
| Total tokens | 10351 |

## Transcript

### user - 2026-06-06T15:57:36.913Z

````markdown
# OpenClaw Routing Classifier

Classify one OpenClaw GitHub issue or pull request for maintainer notification
routing, not code search. Return only the final structured JSON required by the
schema. No prose, markdown, analysis, or extra fields.

Required output shape:

```json
{"topics_of_interest":[],"description":"One concise evidence-backed sentence.","caveats":[]}
```

## Target

`openclaw/openclaw#84509`

## GitHub Context

GitHub item:
- Repository: openclaw/openclaw
- Type: github_pr
- Number: 84509
- URL: https://github.com/openclaw/openclaw/pull/84509
- Title: fix(acp): preserve pre-tool text in final_only delivery mode
- State: closed
- Author: Jerry-Xin
- Labels: size: S, proof: supplied, proof: sufficient, P2, rating: 🐚 platinum hermit, merge-risk: 🚨 automation, merge-risk: 🚨 message-delivery, status: 👀 ready for maintainer look
- Changed files: src/auto-reply/reply/acp-projector.test.ts, src/auto-reply/reply/acp-projector.ts

Body (truncated):
```markdown
## Summary

In `final_only` delivery mode (used by Feishu, QQ Bot, and other channels that prefer a single consolidated reply), text output that precedes tool calls within the same turn is lost. Only the post-tool final response reaches the user.

**Root cause**: In `acp-projector.ts`, the `onEvent` handler calls `flush(true)` + `resetTurnState()` on every `done` event, including intermediate ones (e.g. `stopReason=toolUse`). This prematurely delivers accumulated text and then clears the `finalOnlyOutputText` buffer. When the model outputs more text after tool execution, it arrives as a separate "final" delivery — and channels like Feishu that replace the previous card only show the last one.

**Fix**: In `final_only` mode, intermediate `done` events now call `resetTurnState({ preserveAccumulated: true })`, which resets per-completion state (timers, dedup hashes, pipelines) but preserves all turn-scoped accumulated state:
- `finalOnlyOutputText` and `pendingToolDeliveries` — the text/tool content being assembled
- `emittedOutputChars` and `truncationNoticeEmitted` — output limit enforcement across the entire turn
- `pendingHiddenBoundary` and `lastVisibleOutputTail` — hidden-boundary separator state for correct paragraph breaks after hidden tool calls

The turn-level `flush(true)` in `dispatch-acp.ts` delivers everything as one combined message after the entire turn completes.

Fixes #84486.
Also related to #84491.

## Changes

- `src/auto-reply/reply/acp-projector.ts` — Parameterized `resetTurnState()` with `preserveAccumulated` option; `final_only` + `done` now uses partial reset preserving all accumulated turn state
- `src/auto-reply/reply/acp-projector.test.ts` — 5 new tests + 1 updated existing test

## 

[body truncated: 6877 characters omitted]

 mode, **both texts were delivered as a single consolidated SSE stream** — no premature flush, no split messages
4. **On unpatched `upstream/main`**: the intermediate `done` event after the first completion (stopReason=toolUse) would have called `flush(true)` + `resetTurnState()`, delivering "I'll run that command now." as a premature `kind="final"` delivery and clearing the buffer. The post-tool text would arrive as a second "final" delivery. Channels like Feishu that replace the previous card would only show the last message, losing the pre-tool text entirely.

### Cleanup

```bash
docker rm -f openclaw-test-84486
```

```

Comments/context (truncated):
```markdown
- Jerry-Xin at 2026-05-20T08:39:06Z:
## Real behavior proof

- **Behavior or issue addressed**: In `final_only` delivery mode, text output before tool calls within a multi-step agentic turn is lost because `flush(true)` + `resetTurnState()` fires on intermediate `done` events, prematurely delivering and then clearing the `finalOnlyOutputText` buffer.

- **Real environment tested**: Local patched OpenClaw checkout at `6af59ccb95`, macOS arm64, Node.js `v24.10.0`.

- **Failing proof before fix**: Applied the new test assertions to unpatched `upstream/main` projector code. Two tests fail, confirming the bug:

```
 ❯ src/auto-reply/reply/acp-projector.test.ts > createAcpReplyProjector > supports deliveryMode=final_only by buffering all projected output until done
AssertionError: expected [ { kind: 'tool', …(1) }, …(2) ] to strictly equal []
    → On main, the projector delivers text+tools immediately on the intermediate "done"
      event instead of deferring to the turn-level flush.

 ❯ src/auto-reply/reply/acp-projector.test.t

[comments/context truncated: 20038 characters omitted]

->


- clawsweeper[bot] at 2026-05-23T02:36:03Z:
ClawSweeper applied the proposed close for this PR.

- Action: closed this PR.
- Close reason: duplicate or superseded.
- Evidence: [durable ClawSweeper review](https://github.com/openclaw/openclaw/pull/84509#issuecomment-4496333044).

<!-- clawsweeper-close-applied item=84509 -->
```

Diff/context (selected/truncated):
```diff
diff --git a/src/auto-reply/reply/acp-projector.test.ts b/src/auto-reply/reply/acp-projector.test.ts
index 78d1f9f548a2a..13adbd3f5e777 100644
--- a/src/auto-reply/reply/acp-projector.test.ts
+++ b/src/auto-reply/reply/acp-projector.test.ts
@@ -364,6 +364,9 @@ describe("createAcpReplyProjector", () => {
     expect(deliveries).toStrictEqual([]);
 
     await projector.onEvent({ type: "done" });
+    expect(deliveries).toStrictEqual([]);
+
+    await projector.flush(true);
     expect(deliveries).toHaveLength(3);
     expect(deliveries[0]).toEqual({
       kind: "tool",
@@ -769,4 +772,156 @@ describe("createAcpReplyProjector", () => {
 
     expect(combinedBlockText(deliveries)).toBe("AB");
   });
+
+  describe("final_only multi-completion accumulation", () => {
+    it("accumulates text across intermediate done events in final_only mode", async () => {
+      const { deliveries, projector } = createFinalOnlyStatusToolHarness();
+
+      await projector.onEvent({
+        type: "text_delta",
+        text: "Searching...",
+        tag: "agent_message_chunk",
+      });
+      await projector.onEvent({ type: "done" });
+      expect(deliveries).toStrictEqual([]);
+
+      await projector.onEvent({
+        type: "text_delta",
+        text: "Results: found 3 items",
+        tag: "agent_message_chunk",
+      });
+      await projector.onEvent({ type: "done" });
+      expect(deliveries).toStrictEqual([]);
+
+      await projector.flush(true);
+      const finals = deliveries.filter((d) => d.kind === "final");
+      expect(finals).toHaveLength(1);
+      expect(finals[0]!.text).toBe("Searching...Results: found 3 items");
+    });
+
+    it("flushes text

[file diff truncated: 3611 characters omitted]

ent({
+        type: "text_delta",
+        text: "After tool.",
+        tag: "agent_message_chunk",
+      });
+      await projector.onEvent({ type: "done" });
+
+      await projector.flush(true);
+      const finals = deliveries.filter((d) => d.kind === "final");
+      expect(finals).toHaveLength(1);
+      // Should contain a paragraph separator (\n\n) between the two text segments
+      expect(finals[0]!.text).toContain("Before tool.");
+      expect(finals[0]!.text).toContain("After tool.");
+      expect(finals[0]!.text).toMatch(/Before tool\.\n\nAfter tool\./);
+    });
+  });
 });

diff --git a/src/auto-reply/reply/acp-projector.ts b/src/auto-reply/reply/acp-projector.ts
index 3b919a2b3d462..e405c48707cc5 100644
--- a/src/auto-reply/reply/acp-projector.ts
+++ b/src/auto-reply/reply/acp-projector.ts
@@ -261,21 +261,23 @@ export function createAcpReplyProjector(params: {
     }, liveIdleFlushMs);
   };
 
-  const resetTurnState = () => {
+  const resetTurnState = (opts?: { preserveAccumulated?: boolean }) => {
     clearLiveIdleTimer();
     blockReplyPipeline.stop();
     blockReplyPipeline = createTurnBlockReplyPipeline();
-    emittedOutputChars = 0;
-    truncationNoticeEmitted = false;
     lastStatusHash = undefined;
     lastToolHash = undefined;
     lastUsageTuple = undefined;
-    lastVisibleOutputTail = undefined;
-    pendingHiddenBoundary = false;
     liveBufferText = "";
-    finalOnlyOutputText = "";
-    pendingToolDeliveries.length = 0;
     toolLifecycleById.clear();
+    if (!opts?.preserveAccumulated) {
+      emittedOutputChars = 0;
+      truncationNoticeEmitted = false;
+      lastVisibleOutputTail = undefined;
+      pendingHiddenBoundary = false;
+      finalOnlyOutputText = "";
+      pendingToolDeliveries.length = 0;
+    }
   };
 
   const flushBufferedToolDeliveries = async (force: boolean) => {
@@ -498,8 +500,15 @@ export function createAcpReplyProjector(params: {
     }
 
     if (event.type === "done" || event.type === "error") {
-      await flush(true);
-      resetTurnState();
+      if (settings.deliveryMode === "final_only" && event.type === "done") {
+        // In final_only mode, skip flush on intermediate "done" events.
+        // Text keeps accumulating in finalOnlyOutputText across completions;
+        // the turn-level flush(true) in dispatch-acp.ts delivers everything.
+        resetTurnState({ preserveAccumulated: true });
+      } else {
+        await flush(true);
+        resetTurnState();
+      }
     }
   };
 


[diff truncated from 7810 characters to selected relevant excerpts]
```

Use this context as source of truth. If important sections are missing,
unavailable, selected, or truncated, classify from what is available and mention
material limits in `caveats`.

## Repository Reads

A read-only `bash` tool may be available in the OpenClaw repo snapshot. Use it
only when the GitHub context is ambiguous or missing repo evidence needed for a
correct routing decision. Prefer short commands such as `pwd`, `ls`, `find`,
`rg`, `grep`, `sed -n`, `cat`, `head`, `tail`, `wc -l`,
`git show --name-only`, `git ls-files`, or `git grep`.
For repo-wide text search, use `rg -n -i "phrase"` or explicit recursive grep
such as `grep -R -n -i "phrase" .`. For file discovery, use
`rg --files -g "*.ts"` or `git ls-files src`.
Do not call `bash` when the provided GitHub context is enough.

## Allowed Topics

```json
[
  "local_models",
  "local_model_providers",
  "model_serving",
  "self_hosted_inference",
  "open_weight_models",
  "acpx",
  "acp",
  "coding_agents",
  "mcp_tooling",
  "hf_agents",
  "hub_workflows",
  "post_training",
  "model_releases",
  "agent_demos",
  "codex",
  "agent_runtime",
  "sessions",
  "gateway",
  "exec_tools",
  "approvals",
  "sandboxing",
  "hooks",
  "cron_automation",
  "chat_integrations",
  "ui_tui",
  "browser_automation",
  "memory",
  "security",
  "config",
  "packaging_deployment",
  "docs",
  "tests_ci",
  "telemetry_usage",
  "api_surface",
  "queueing",
  "notifications",
  "skills_plugins",
  "auth_identity",
  "reliability",
  "tool_calling"
]
```

Topic definitions and cue words:

- `local_models`: Local model execution, local inference behavior, local model UX, local-only f... cues: local model
- `local_model_providers`: Local or self-hosted model backend setup, discovery, auth, routing, and compa... cues: local provider config
- `model_serving`: Serving protocols, streaming behavior, routing, lifecycle, and gateway behavi... cues: vllm
- `self_hosted_inference`: Self-hosted inference systems and locally operated services, including embedd... cues: self-hosted
- `open_weight_models`: Open-weight model families, model packaging, quantization, and local deployab... cues: open weight
- `acpx`: ACPX protocol, transport, proxy, backend process, compatibility, and files or... cues: acpx
- `acp`: ACP protocol features and session tools that are not necessarily ACPX-specific. cues: acp
- `coding_agents`: General coding-agent runtime, tools, approvals, sandboxes, sessions, hooks, a... cues: agent run
- `mcp_tooling`: MCP server or client behavior, tools/list, resources, and tool invocation com... cues: mcp
- `hf_agents`: Hugging Face agent workflows, Spaces, Hub agent demos, or HF-specific agent i... cues: hugging face
- `hub_workflows`: Hub automation for datasets, models, Spaces, releases, and repository synchro... cues: hub
- `post_training`: Fine-tuning, preference optimization, evaluation loops, and data generation a... cues: fine tune
- `model_releases`: New model release tracking or version-specific model behavior. cues: model release
- `agent_demos`: Demo workflows and visible examples for agents. cues: demo
- `codex`: Items that explicitly involve the Codex runtime or command compatibility. cues: codex
- `agent_runtime`: Agent runner, harness, orchestration, subagent execution, heartbeat, and agen... cues: agent run
- `sessions`: Session identity, persistence, binding, transcript, resume, reset, parent/chi... cues: session
- `gateway`: OpenClaw gateway behavior, daemon startup, HTTP gateway routes, gateway resta... cues: gateway
- `exec_tools`: Shell execution, exec tools, command allowlists, tool invocation, tool schema... cues: exec
- `approvals`: Approval flows, permission modes, approve/deny commands, policy checks, and p... cues: approval
- `sandboxing`: Sandbox isolation, containers, Docker, process limits, filesystem hiding, and... cues: sandbox
- `hooks`: Hook lifecycle, hook events, hook payloads, hook filtering, and managed hook ... cues: hook
- `cron_automation`: Cron jobs, scheduled runs, heartbeat automation, one-shot jobs, and recurring... cues: cron
- `chat_integrations`: Chat platform integrations and delivery surfaces such as Discord, Telegram, S... cues: discord
- `ui_tui`: Control UI, TUI, dashboard, web UI, session list, status views, and user-faci... cues: ui
- `browser_automation`: Browser automation, screenshots, Chrome integration, browser vision, and web ... cues: browser
- `memory`: Memory systems, embeddings, vector stores, active memory, LanceDB, and memory... cues: memory
- `security`: Security, SSRF, credentials, secrets, token handling, auth hardening, HMAC, v... cues: security
- `config`: Configuration files, config schema, defaults, setup/onboarding, environment v... cues: config
- `packaging_deployment`: Build, packaging, deployment, service managers, SEA, launchd, systemd, pnpm, ... cues: build
- `docs`: Documentation, guides, README changes, spelling, taxonomy, and explanatory co... cues: docs
- `tests_ci`: Tests, CI, fixtures, coverage, mocks, and platform-specific test fixes. cues: test
- `telemetry_usage`: Usage accounting, token counts, cost metadata, traces, diagnostics, status re... cues: usage
- `api_surface`: HTTP APIs, gateway APIs, REST endpoints, webhooks, SSE, OpenResponses, chat c... cues: api
- `queueing`: Queues, lanes, task state, follow-up queues, run ordering, locks, stuck jobs,... cues: queue
- `notifications`: Notification policy, delivery gates, notify settings, outbound messages, anno... cues: notify
- `skills_plugins`: Skills, plugins, plugin runtime, extensions, Superpowers, hook packs, MCP App... cues: skill
- `auth_identity`: Authentication, identity, OAuth, device identity, profile selection, account ... cues: auth
- `reliability`: Reliability fixes for retries, stale state, crashes, timeouts, recovery, clea... cues: retry
- `tool_calling`: Model tool-calling behavior, tool-call deltas, tool schemas, tool result rout... cues: tool call

## Decision Rules

Choose the smallest set of topics needed to route this item to the right
maintainer interest bucket. Do not describe every technical area touched.

Process:

1. Identify the single main user-visible problem or feature from the title.
2. Pick the one allowed topic that best names that problem.
3. Add a second topic only if the item would be misrouted without it.
4. Delete topics that merely name implementation details, affected subsystems,
   examples, validation work, or likely consequences.

Default topic count:

- 0 topics when no allowed topic is central.
- 1 topic for normal items.
- 2 topics only for genuinely cross-topic items.
- 3+ topics only for explicit multi-system coordination.

Title-first centrality:

- The title is the strongest routing evidence.
- Body, labels, files, comments, and diff can confirm the title topic or add one
  essential second topic, but must not broaden the label set.
- If a candidate topic is not supported by the title or first clear problem
  statement in the body, omit it.
- Treat changed files and tests as weak evidence unless they are the subject.

Enum discipline:

- Output only exact allowed topic ids.
- Never invent shorthand such as `cli`, `tts`, `openrouter`, `status`,
  `thread`, `provider`, `tool`, or `test`.
- If the closest word in the title is not allowed, map it to the nearest
  allowed topic or omit it.

## Positive Cues

- Counts, usage, cost, tokens, metrics, diagnostics, traces, and status
  reporting route to `telemetry_usage`.
- Subagents, coding-agent runs, harness behavior, approvals, sandboxing,
  compaction, or agent orchestration route to `coding_agents`.
- LM Studio, Ollama, llama.cpp, GGUF, local hardware, local model compatibility,
  local fallback, and local context behavior route to `local_models`.
- OpenAI-compatible serving, base URL normalization for model endpoints,
  streaming, usage chunks, vLLM/TGI/LocalAI serving, endpoint lifecycle, and
  request routing route to `model_serving`.
- Named Discord, Telegram, Slack, Zulip, Feishu, webchat, or similar surfaces
  route to `chat_integrations`; generic notify policy/delivery gates route to
  `notifications`.
- Chat UI display/status/footer behavior routes to `ui_tui` only when the
  user-facing interface is central.

## Hard Local Model Filters

Before final output:

- Delete `local_model_providers` unless the item explicitly centers a local,
  self-hosted, or user-declared OpenAI-compatible backend: LM Studio, Ollama,
  vLLM, LocalAI, llama.cpp, Atomic Chat, localhost/LAN, or private inference.
- Never use `local_model_providers` for hosted provider catalogs/manifests,
  hosted model availability, hosted auth, usage/billing UI, TTS/speech/image
  behavior, or hosted APIs. Hosted catalog updates are `model_releases` and
  sometimes `config`; hosted usage/billing/status work is `telemetry_usage` or
  `ui_tui`.
- Use `local_models` only for concrete local/offline model execution or
  compatibility; not model IDs, catalogs, lists, static entries, provider
  manifests, or hosted provider availability. Keep it for local-model lean
  filtering and local-model runtime crashes.

## Over-Label Guardrails

- `api_surface`: external API, CLI, or HTTP contracts only. Not internal
  payloads/options/functions, status text, UI events, or ordinary command
  behavior.
- `reliability`: operational failures such as timeout, crash, leak, retry,
  stuck state, data loss, cleanup, or recovery. Not a generic bug tag.
- `sessions`: session lifecycle/state/storage/identity only. Not every item
  mentioning session context or files.
- `local_model_providers`: provider setup/routing/auth/discovery/compatibility
  only. Not every local endpoint issue.
- `config`: configuration behavior itself, not any feature with an option.
- `docs` and `tests_ci`: only when docs or test tooling is the subject.

## Tie-Breakers

- Count/usage/token/cost/metric/trace/diagnostic/status/footer-count features
  are `telemetry_usage`, even if shown in UI or session status.
- Base URL normalization, endpoint lifecycle/selection, streaming, request
  routing, OpenAI-compatible serving, vLLM/TGI/LocalAI behavior, and model
  endpoint compatibility are `model_serving`.
- TTS, shell/exec, command, tool invocation, allowlist, and execution-control
  behavior are `exec_tools` when the feature controls execution or spoken/tool
  output.
- Thread/session isolation, per-session binding, fallback recovery state, and
  lifecycle state are `sessions` when those boundaries are central.
- Structured tool result display, stdout rendering for tool results, pre-tool
  text preservation, and tool-call transcript/content handling are
  `tool_calling` when tool-call semantics are central.
- Delivery fallback, outbound recovery, lost final/pre-tool text, duplicate
  cleanup, and lifecycle recovery are `reliability` when recovery correctness is
  central.

## False-Positive Suppression

- Do not use `local_model_providers` for base URL normalization,
  OpenRouter/OpenAI-compatible endpoint fixes, endpoint lifecycle, streaming,
  usage chunks, or vLLM/TGI/LocalAI serving. Use `model_serving` unless provider
  setup/auth/discovery/routing is central.
- Do not use `notifications` for named Discord/Telegram/Slack/Zulip/Feishu
  behavior, ACP final/pre-tool text preservation, delivery fallback recovery, or
  outbound recovery correctness. Use `chat_integrations` for named chat surfaces
  and `reliability` for recovery/loss/fallback.
- Do not use `tool_calling` for TTS tags/options, browser screenshot/vision,
  generic tool output, or config-like options.
- Do not use `api_surface` for parse helpers, CLI edge-case tests, token
  parsing, status/footer display, internal command behavior, or local model
  compatibility.
- Do not use `config` merely because a feature adds an option. Route by what
  the option controls.
````

### assistant - 2026-06-06T16:00:23.273Z

<details open><summary>Thinking (12082 chars, 217 lines)</summary>

```text
The user wants me to classify a specific GitHub PR (`openclaw/openclaw#84509`) into one or more allowed topics based on the provided instructions.

`openclaw/openclaw#84509`
"fix(acp): preserve pre-tool text in final_only delivery mode"

    - Repository: `openclaw/openclaw`
    - Type: `github_pr`
    - Title: `fix(acp): preserve pre-tool text in final_only delivery mode`
    - Body Summary: In `final_only` delivery mode (used by Feishu, QQ Bot, etc.), text output preceding tool calls is lost. The fix involves preserving `finalOnlyOutputText` across intermediate `done` events in `acp-projector.ts`.
    - Key Components: `acp`, `final_only` delivery mode, text preservation before tool calls, `chat_integrations` (Feishu, QQ Bot), `reliability` (lost text).

    - `local_models`: No.
    - `local_model_providers`: No.
    - `model_serving`: No.
    - `self_hosted_inference`: No.
    - `open_weight_models`: No.
    - `acpx`: No.
    - `acp`: Yes (title has `acp`, body mentions ACP features).
    - `coding_agents`: No.
    - `mcp_tooling`: No.
    - `hf_agents`: No.
    - `hub_workflows`: No.
    - `post_training`: No.
    - `model_releases`: No.
    - `agent_demos`: No.
    - `codex`: No.
    - `agent_runtime`: No.
    - `sessions`: No.
    - `gateway`: No.
    - `exec_tools`: No.
    - `approvals`: No.
    - `sandboxing`: No.
    - `hooks`: No.
    - `cron_automation`: No.
    - `chat_integrations`: The body mentions Feishu and QQ Bot, but the "False-Positive Suppression" says: "Do not use `notifications` for named Discord/Telegram/Slack/Zulip/Feishu behavior, ACP final/pre-tool text preservation... Use `chat_integrations` for named chat surfaces". However, "ACP final/pre-tool text preservation" is also listed under "False-Positive Suppression" for `notifications`. Let's check `chat_integrations`.
    - `ui_tui`: No.
    - `browser_automation`: No.
    - `memory`: No.
    - `security`: No.
    - `config`: No.
    - `packaging_deployment`: No.
    - `docs`: No.
    - `tests_ci`: No.
    - `telemetry_usage`: No.
    - `api_surface`: No.
    - `queueing`: No.
    - `notifications`: No (suppressed).
    - `skills_plugins`: No.
    - `auth_identity`: No.
    - `reliability`: Yes (the fix addresses lost text, which is a reliability/correctness issue in delivery).
    - `tool_calling`: Yes (the issue is specifically about "pre-tool text preservation" and "tool-call transcript/content handling").

    - Title: `fix(acp): preserve pre-tool text in final_only delivery mode`
    - The core issue is about handling tool calls and text delivery within the ACP framework.
    - The "Tie-Breakers" section says: "Structured tool result display, stdout rendering for tool results, pre-tool text preservation, and tool-call transcript/content handling are `tool_calling` when tool-call semantics are central."
    - The "False-Positive Suppression" says: "Do not use `notifications` for ... ACP final/pre-tool text preservation... Use `chat_integrations` for named chat surfaces".
    - Since it's about "pre-tool text preservation", `tool_calling` is a very strong candidate.
    - It also involves `acp`.

    - `acp`: Mentioned in title and core logic.
    - `tool_calling`: Explicitly mentioned in tie-breakers for "pre-tool text preservation".

    Wait, let's check `reliability`. "Delivery fallback, outbound recovery, lost final/pre-tool text... are `reliability` when recovery correctness is central."
    The PR is about fixing a bug where text is lost. Is it "recovery correctness"? It's a bug fix for a delivery mode.

    The instructions say "Choose the smallest set of topics needed to route this item to the right maintainer interest bucket."
    The title is `fix(acp): ...`. This suggests `acp`.
    The content is about tool call handling. This suggests `tool_calling`.

    Let's look at `tool_calling` definition: "Model tool-calling behavior, tool-call deltas, tool schemas, tool result rout...".
    The issue is "pre-tool text preservation".

    The "False-Positive Suppression" specifically mentions "ACP final/pre-tool text preservation" as a reason NOT to use `notifications`. It says "Use `chat_integrations` for named chat surfaces".
    Wait, "Use `chat_integrations` for named chat surfaces" is a bit ambiguous when combined with "Do not use `notifications` for ... ACP final/pre-tool text preservation".
    Actually, it says: "Do not use `notifications` for ... ACP final/pre-tool text preservation... Use `chat_integrations` for named chat surfaces". This might mean if it's about Feishu, use `chat_integrations`.

    However, the title is `fix(acp)`.

    Let's re-read "Tie-Breakers":
    "Structured tool result display, stdout rendering for tool results, pre-tool text preservation, and tool-call transcript/content handling are `tool_calling` when tool-call semantics are central."

    This seems like the most specific match for the technical content of the PR.

    Is `acp` needed? The title is `fix(acp)`. Usually, `acp` is a broader category.
    If I have to pick one, `tool_calling` seems to describe the "what" (pre-tool text preservation), while `acp` describes the "where" (ACP protocol).

    Let's check if `acp` is a primary topic.
    `acp`: ACP Protocol features and session tools that are not necessarily ACPX-specific.

    Actually, the PR is about the ACP projector.
    The "pre-tool text preservation" is a specific behavior of the ACP projector in `final_only` mode.

    I will go with `acp` and `tool_calling`.

    Wait, "Return only the final structured JSON ... No prose ...".

    Let's double check the topics.
    `acp`
    `tool_calling`

    Is `reliability` needed? It's a "fix" for "lost" text. "Delivery fallback, outbound recovery, lost final/pre-tool text... are `reliability` when recovery correctness is central."
    The PR is about a bug in the delivery logic.

    However, "pre-tool text preservation" is explicitly mentioned in the `tool_calling` tie-breaker.

    I'll stick to `acp` and `tool_calling`.

    Wait, the title starts with `fix(acp)`.
    The description says "In `final_only` delivery mode ... text output that precedes tool calls ... is lost."
    The fix is in `acp-projector.ts`.

    If I only pick one, which one? `acp` is very specific to the subsystem.
    But `tool_calling` is the functional area.
    The instructions say "Pick the one allowed topic that best names that problem."
    The problem is "pre-tool text preservation".
    The tie-breaker says "pre-tool text preservation ... are `tool_calling`".

    So `tool_calling` is the best naming of the problem.
    Does it need `acp`? The instructions say "Add a second topic only if the item would be misrouted without it."
    Since many things in `acp` might not be about `tool_calling`, and many things about `tool_calling` might not be in `acp`, and this is specifically an `acp` fix, `acp` is a good second topic.

    Wait, `acp` is for "ACP Protocol features".
    The PR fixes the ACP projector's behavior for `final_only` mode.

    Actually, the title-first centrality: "The title is the strongest routing evidence."
    Title: `fix(acp): preserve pre-tool text in final_only delivery mode`
    Title topic: `acp`.
    Problem statement in body: "In `final_only` delivery mode ... text output that precedes tool calls ... is lost."
    Problem topic: `tool_calling`.

    I will use both.

    Wait, let's check `reliability` again. "lost final/pre-tool text ... are `reliability`".
    If I use `reliability`, I might be over-labeling if the goal is "pre-tool text preservation" as a feature/behavior of the tool-calling logic in ACP.
    The PR is a fix for a bug where a feature (pre-tool text preservation) was broken.
    Usually, bug fixes for correct behavior are the primary topic.

    Let's look at the "False-Positive Suppression" for `notifications`: "Do not use `notifications` for ... ACP final/pre-tool text preservation".
    This implies that `acp` or `tool_calling` (or something else) should be used.

    I will use `acp` and `tool_calling`.

    One more check: `chat_integrations`?
    "Do not use `notifications` for named Discord/Telegram/Slack/Zulip/Feishu behavior... Use `chat_integrations` for named chat surfaces".
    The PR mentions Feishu and QQ Bot.
    But the core fix is in the `acp-projector.ts`, which is shared. It's not a Feishu-specific fix; it's a fix for the ACP projector that *affects* Feishu.

    So `acp` and `tool_calling` are the most accurate.

    Wait, I see `reliability` in the tie-breaker: "Delivery fallback, outbound recovery, lost final/pre-tool text, duplicate cleanup, and lifecycle recovery are `reliability` when recovery correctness is central."
    Is "recovery correctness" central? The bug is that text is *lost*. The fix *preserves* it. This is about correctness of the delivery.
    But "pre-tool text preservation" is specifically listed under `tool_calling`.

    I'll go with `acp` and `tool_calling`.

    One sentence description: "Fixes a bug in the ACP projector where pre-tool text was lost in `final_only` delivery mode by preserving accumulated state across intermediate `done` events."

    Wait, the instructions say "One concise evidence-backed sentence."
    The description should be concise.

    Let's refine the topics.
    `acp`
    `tool_calling`

    Actually, if I only have to pick one, `acp` is in the title.
    But `tool_calling` is the specific behavior.

    I'll use both.

    Wait, I should check if `acp` is really a topic. Yes, it is.

    Final check on "False-Positive Suppression":
    "Do not use `notifications` for ... ACP final/pre-tool text preservation... Use `chat_integrations` for named chat surfaces".
    This suggests that if it's about Feishu, it *could* be `chat_integrations`.
    But it's about the *ACP projector* logic.

    I'll stick with `acp` and `tool_calling`.

    Wait, the prompt says: "Pick the one allowed topic that best names that problem."
    The problem is "pre-tool text preservation".
    Topic: `tool_calling`.

    "Add a second topic only if the item would be misrouted without it."
    The repository is `openclaw`, and `acp` is a specific subsystem. Many maintainers might be interested in `acp` specifically.

    Description: "Fixes a bug in the ACP projector where pre-tool text was lost in `final_only` delivery mode by preserving accumulated state across intermediate `done` events."

    Caveats: None, the context is clear.

    Actually, looking at the "Tie-Breakers" again:
    "Structured tool result display, stdout rendering for tool results, pre-tool text preservation, and tool-call transcript/content handling are `tool_calling` when tool-call semantics are central."
    The PR is exactly about "pre-tool text preservation".

    So `tool_calling` is definitely one.
    Is `acp` needed? The title is `fix(acp)`.
    The prompt says "The title is the strongest routing evidence."
    The title has `acp`.

    I will include both.

    One more thing: "Return only the final structured JSON required by the schema. No prose, markdown, analysis, or extra fields."

    Let's verify the allowed topics again.
    `acp` - Yes.
    `tool_calling` - Yes.

    Wait, the prompt says "Return only the final structured JSON".

    I'll prepare the JSON.

    One detail: "pre-tool text preservation" is in the "Tie-Breakers" for `tool_calling`.
    "delivery fallback, outbound recovery, lost final/pre-tool text ... are `reliability` when recovery correctness is central."
    Is "correctness" central? The PR fixes a bug where text is lost. This is a correctness issue.
    However, "pre-tool text preservation" is specifically listed as `tool_calling`.
    Usually, specific overrides general. `tool_calling` is more specific than `reliability` (which is for "operational failures such as timeout, crash, leak, retry, stuck state, data loss, cleanup, or recovery"). "Lost text" is data loss, but "pre-tool text preservation" is a specific feature of the tool-calling output.

    I'll stick with `acp` and `tool_calling`.
```

</details>

#### Tool call: final_json

```json
{
  "id": "BULWwLTvgGQKXftiNf05yZiqE17pyuK7",
  "name": "final_json",
  "arguments": {
    "caveats": [
      "The provided GitHub context is truncated, but the relevant logic for the ACP projector and the fix for pre-tool text preservation is clearly described in the summary and diff sections."
    ],
    "description": "Fixes a bug in the ACP projector where pre-tool text was lost in `final_only` delivery mode by preserving accumulated state across intermediate `done` events.",
    "topics_of_interest": [
      "acp",
      "tool_calling"
    ]
  }
}
```

#### Message metadata

```json
{
  "api": "openai-completions",
  "provider": "local-openai",
  "model": "gemma-4-12b-it-qat-q4_0",
  "usage": {
    "input": 6981,
    "output": 3370,
    "cacheRead": 0,
    "cacheWrite": 0,
    "totalTokens": 10351,
    "cost": {
      "input": 0,
      "output": 0,
      "cacheRead": 0,
      "cacheWrite": 0,
      "total": 0
    }
  },
  "stopReason": "toolUse",
  "responseId": "chatcmpl-ZrpDmiGdOUInlQSgAkzTbtc5iEbfjGjk"
}
```

### toolResult - 2026-06-06T16:00:23.275Z

```text
Structured final answer captured.
```


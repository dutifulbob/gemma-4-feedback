# Reproduction

Yes, both classifier runs were executed through `localpager-agent`.

The entrypoint was Localpager's classifier wrapper:

```bash
/home/bob/repos/localpager/scripts/localpager-classifier
```

That wrapper:

1. Renders GitHub context for the target PR.
2. Renders the OpenClaw routing prompt/template and JSON schema.
3. Runs `localpager-agent` with `--final-schema`.
4. Launches Pi under `localpager-agent`.
5. Requires the model to call the `final_json` tool.

The relevant wrapper invocation inside `scripts/localpager-classifier` is:

```bash
npm --prefix "$agent_dir" run -s localpager-agent -- \
  --model "$model" \
  --session-dir "$session_dir" \
  --final-schema "$schema_path" \
  --base-url "$base_url" \
  --max-tokens "$max_tokens" \
  --timeout-ms "$timeout_ms" \
  --tools "$tools" \
  -p "$(cat "$prompt_path")"
```

For these runs, `--tools final_json` was used. No bash/repo shell tool was
available to the model.

## Repository State

Local checkouts at inspection time:

- Localpager: `6cad649c665003a62a6397e32701ab5d4711c463`
- Localpi: `745d444ec2f9aa1fce34d759f002fe6fd24f1f54`

Commands below assume:

- Localpager checkout: `/home/bob/repos/localpager`
- Model file:
  `/home/bob/.lmstudio/models/google/gemma-4-12B-it-qat-q4_0-gguf/gemma-4-12b-it-qat-q4_0.gguf`
- llama-server endpoint: `http://127.0.0.1:18194/v1`
- Localpager has dependencies installed under `localpager-agent/node_modules`
- Localpager can render GitHub context for `openclaw/openclaw#84509`

The model file and inference engine details are in
[`environment-and-checkpoint.md`](environment-and-checkpoint.md).

## Original Default-Reasoning Run

This run reproduced the long generation. The key detail is that `llama-server`
was started without `--reasoning off`, leaving Gemma 4 template reasoning in
auto/default mode.

Start the server:

```bash
/home/bob/.cache/localpager-benchmarks/llama.cpp-b9533-vulkan-arm64/llama-b9533/llama-server \
  --host 127.0.0.1 \
  --port 18194 \
  --model /home/bob/.lmstudio/models/google/gemma-4-12B-it-qat-q4_0-gguf/gemma-4-12b-it-qat-q4_0.gguf \
  --alias gemma-4-12b-it-qat-q4_0 \
  --ctx-size 32768 \
  --parallel 1 \
  --gpu-layers 999 \
  --metrics
```

Then run the classifier from the Localpager repo root:

```bash
cd /home/bob/repos/localpager

START=$(date +%s)
LOCALPAGER_CLASSIFIER_STATE_DIR=/tmp/localpager-classifier-reasoning-auto-repro \
./scripts/localpager-classifier 'openclaw/openclaw#84509' \
  --model gemma-4-12b-it-qat-q4_0 \
  --base-url http://127.0.0.1:18194/v1 \
  --schema "$PWD/schemas/classification.schema.json" \
  --prompt-template "$PWD/examples/profiles/openclaw-routing-v8.prompt.md" \
  --topic-taxonomy "$PWD/examples/profiles/openclaw-routing-topics.json" \
  --tools final_json \
  --max-tokens 1024 \
  --timeout-ms 10000
END=$(date +%s)
echo "elapsed_seconds=$((END-START))"
```

Observed result:

- End-to-end time: 170 seconds
- Prompt tokens: 6,981
- Generated tokens: 3,370
- Final topics: `["acp", "tool_calling"]`
- Session path:
  `/tmp/localpager-classifier-reasoning-auto-repro/sessions/20260606T155733Z-174497`

Rendered transcript in this repo:

- [`../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md`](../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md)

Raw session:

- [`../sessions/gemma-4-12b-localpager-reasoning-auto.jsonl`](../sessions/gemma-4-12b-localpager-reasoning-auto.jsonl)

## Low-Thinking Run

This run used the same Localpager classifier path but started the managed server
through Localpi with a bounded server-side reasoning budget.

Start or restart the server:

```bash
Q40=/home/bob/.lmstudio/models/google/gemma-4-12B-it-qat-q4_0-gguf/gemma-4-12b-it-qat-q4_0.gguf

LOCALPI_STATE_DIR=/tmp/localpi-gemma12b-q40-test \
localpi --model "$Q40" --thinking low -p 'Reply with exactly: low-ready'
```

That maps to:

```bash
llama-server \
  --host 127.0.0.1 \
  --port 18194 \
  --model /home/bob/.lmstudio/models/google/gemma-4-12B-it-qat-q4_0-gguf/gemma-4-12b-it-qat-q4_0.gguf \
  --alias gemma-4-12b-it-qat-q4_0 \
  --ctx-size 32768 \
  --parallel 1 \
  --gpu-layers 999 \
  --reasoning on \
  --reasoning-budget 128 \
  --reasoning-format deepseek \
  --metrics
```

Then run the classifier from the Localpager repo root:

```bash
cd /home/bob/repos/localpager

START=$(date +%s)
LOCALPAGER_CLASSIFIER_STATE_DIR=/tmp/localpager-classifier-gemma12b-low-reasoning \
./scripts/localpager-classifier 'openclaw/openclaw#84509' \
  --model gemma-4-12b-it-qat-q4_0 \
  --base-url http://127.0.0.1:18194/v1 \
  --schema "$PWD/schemas/classification.schema.json" \
  --prompt-template "$PWD/examples/profiles/openclaw-routing-v8.prompt.md" \
  --topic-taxonomy "$PWD/examples/profiles/openclaw-routing-topics.json" \
  --tools final_json \
  --max-tokens 1024 \
  --timeout-ms 10000
END=$(date +%s)
echo "elapsed_seconds=$((END-START))"
```

Observed result:

- End-to-end time: 22 seconds
- Prompt tokens: 6,978
- Generated tokens: 231
- Final topics: `["reliability", "tool_calling"]`
- Session path:
  `/tmp/localpager-classifier-gemma12b-low-reasoning/sessions/20260606T164219Z-228860`

Rendered transcript in this repo:

- [`../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md`](../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md)

Raw session:

- [`../sessions/gemma-4-12b-localpager-low-thinking.jsonl`](../sessions/gemma-4-12b-localpager-low-thinking.jsonl)

## Viewing A Reproduced Session

Localpager's session helper opens a classifier session through `localpager-agent`
and Pi:

```bash
cd /home/bob/repos/localpager

LOCALPAGER_AGENT_BASE_URL=http://127.0.0.1:18194/v1 \
LOCALPAGER_AGENT_MODEL=gemma-4-12b-it-qat-q4_0 \
./scripts/localpager-agent-session \
  /tmp/localpager-classifier-reasoning-auto-repro/sessions/20260606T155733Z-174497
```

For a plain-text printout instead of the TUI:

```bash
./scripts/localpager-agent-session --print \
  /tmp/localpager-classifier-reasoning-auto-repro/sessions/20260606T155733Z-174497
```

Vanilla Pi can also view the JSONL files directly when configured with a matching
local OpenAI-compatible provider. See the commands in the repository README.

## Safety Notes

These runs intentionally used one local model server at a time. LM Studio model
loading was not used for these classifier runs. After the low-thinking test, the
live server was restored to:

```bash
--reasoning off --reasoning-format deepseek
```

# Environment And Checkpoint

This file records the inference engine, model checkpoint, and local runtime
details for the Gemma 4 12B classifier sessions in this repository.

## Inference Engine

- Engine: `llama-server` from `llama.cpp`
- Version: `9533`
- Commit: `c4a278d68`
- Build line: `built with GNU 14.2.0 for Linux aarch64`
- Binary used:
  `/home/bob/.cache/localpager-benchmarks/llama.cpp-b9533-vulkan-arm64/llama-b9533/llama-server`
- Shell-resolved command:
  `/home/bob/.local/share/../bin/llama-server`
- Backend: Vulkan
- GPU reported by llama.cpp: `Vulkan0 : NVIDIA GB10 (91859 MiB, 91857 MiB free)`
- CPU/system line from llama.cpp:
  `n_threads = 20 (n_threads_batch = 20) / 20 | CPU : NEON = 1 | ARM_FMA = 1 | FP16_VA = 1 | MATMUL_INT8 = 1 | SVE = 1 | DOTPROD = 1 | SVE_CNT = 16 | OPENMP = 1 | REPACK = 1`

Host:

- Machine: `isengard`
- OS: Ubuntu 24.04.4 LTS (`noble`)
- Kernel: `Linux 6.17.0-1008-nvidia`
- Architecture: `aarch64`
- System memory at inspection time: 119 GiB total

## Checkpoint

- Model id served to clients: `gemma-4-12b-it-qat-q4_0`
- Hugging Face checkpoint/repo name used for the file:
  `google/gemma-4-12B-it-qat-q4_0-gguf`
- GGUF filename: `gemma-4-12b-it-qat-q4_0.gguf`
- Local path:
  `/home/bob/.lmstudio/models/google/gemma-4-12B-it-qat-q4_0-gguf/gemma-4-12b-it-qat-q4_0.gguf`
- File size: 6,975,877,728 bytes
- SHA-256:
  `faff1a63667fac17ac5e777f47114688fcefea96e220e211aaa8d62c2c4561f1`
- Quantization: `Q4_0`, from the checkpoint filename
- GGUF strings observed near metadata:
  - `general.architecture`: `gemma4`
  - `general.name`: `12B_qat_it_dequant_safetensors`
  - `general.finetune`: `12B_qat_it_dequant_safetensors`

Model metadata reported by `/v1/models`:

```json
{
  "vocab_type": 2,
  "n_vocab": 262144,
  "n_ctx": 32768,
  "n_ctx_train": 262144,
  "n_embd": 3840,
  "n_params": 11907350576,
  "size": 6960054464
}
```

The model advertises a 262,144-token training context, but these runs served it
with a 32,768-token context.

## Runtime Settings

Common llama-server settings for both classifier runs:

- Host: `127.0.0.1`
- Port: `18194`
- Context size: `32768`
- Parallel slots: `1`
- GPU layers: `999`
- Metrics endpoint: enabled with `--metrics`
- Chat format reported by llama.cpp: `peg-gemma4`
- Reasoning format: `deepseek` when reasoning was explicitly configured
- Prompt cache: enabled, size limit 8192 MiB
- Context checkpoints: enabled, max 32, min spacing 256

Original default-reasoning run:

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

In this mode, llama.cpp detected thinking from the Gemma 4 template:

- Log line: `chat template, thinking = 1`
- Reasoning budget log: `budget=2147483647 tokens`

Low-thinking run:

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

In this mode, llama.cpp logged that the reasoning budget was exhausted and then
forced the end-of-thinking sequence before the final JSON tool call.

After the low-thinking test, the live server was restored to:

```bash
--reasoning off --reasoning-format deepseek
```

## Client And Harness

- Classifier harness: `localpager-agent` via `scripts/localpager-classifier`
- Full reproduction commands:
  [`reproduction.md`](reproduction.md)
- Localpager checkout commit at inspection time:
  `6cad649c665003a62a6397e32701ab5d4711c463`
- Localpi checkout commit after adding bounded thinking:
  `745d444ec2f9aa1fce34d759f002fe6fd24f1f54`
- Node.js: `v22.22.0`
- npm: `10.9.4`
- Pi invocation: `npx -y @earendil-works/pi-coding-agent@latest`

Pi package version caveat: the raw session JSONL records the provider/model and
Pi thinking level, but it does not record the Pi package version. The local npm
cache contained `@earendil-works/pi-coding-agent` versions `0.74.1` and `0.78.1`
at inspection time.

## Session Files

- Original default-reasoning JSONL:
  [`../sessions/gemma-4-12b-localpager-reasoning-auto.jsonl`](../sessions/gemma-4-12b-localpager-reasoning-auto.jsonl)
- Original default-reasoning Markdown:
  [`../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md`](../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-default-reasoning.md)
- Low-thinking JSONL:
  [`../sessions/gemma-4-12b-localpager-low-thinking.jsonl`](../sessions/gemma-4-12b-localpager-low-thinking.jsonl)
- Low-thinking Markdown:
  [`../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md`](../rendered-sessions/2026-06-06-openclaw-84509-gemma4-12b-low-thinking-budget-128.md)

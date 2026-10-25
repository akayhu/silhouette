#!/bin/bash
# 安裝台灣腔 AI 人聲（BreezyVoice，聯發科開源，Apache-2.0）
# 需要 macOS（Apple Silicon）與 Homebrew，會下載約 3 GB（Python 套件＋模型）。
set -e
cd "$(dirname "$0")/../tts"

brew list python@3.10 >/dev/null 2>&1 || brew install python@3.10
[ -d BreezyVoice ] || git clone --depth 1 https://github.com/mtkresearch/BreezyVoice.git
# 讓 flow 的推論步數可調整（service.py 不改也能用，預設 10 步）
sed -i '' 's/            n_timesteps=10$/            n_timesteps=getattr(self, "n_timesteps", 10)/' BreezyVoice/cosyvoice/flow/flow.py

[ -d .venv ] || /opt/homebrew/opt/python@3.10/bin/python3.10 -m venv .venv
PIP=.venv/bin/pip
$PIP install -q --upgrade pip "setuptools<70" wheel
$PIP install -q torch==2.3.1 torchaudio==2.3.1 "numpy<2" tiktoken numba more-itertools tqdm
$PIP install -q --no-build-isolation openai-whisper==20231117
# scipy 1.15 的 macOS 版在新版系統上無法載入，固定 1.14.1；ruamel.yaml 要舊版才相容 HyperPyYAML
# WeTextProcessing（需要 pynini）在 macOS 裝不起來，改用 tts/shims 裡的輕量版
$PIP install -q conformer==0.3.2 diffusers==0.32.0 hydra-core==1.3.2 HyperPyYAML==1.2.2 "ruamel.yaml<0.18" \
  inflect==7.3.1 librosa==0.10.2 lightning==2.2.4 omegaconf==2.3.0 onnxruntime==1.18.1 soundfile==0.12.1 \
  opencc-python-reimplemented g2pw huggingface_hub transformers==4.44.2 rich scipy==1.14.1 \
  gdown==5.1.0 matplotlib==3.7.5 wget==3.2 networkx==3.1 einops pyarrow

.venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("MediaTek-Research/BreezyVoice", local_dir="models/BreezyVoice",
                  allow_patterns=["*.pt", "*.onnx", "cosyvoice.yaml", "configuration.json", "README.md"])
PY
echo "完成！重新啟動 npm run dev 後，朗讀面板會出現「台灣腔 AI 人聲」。"

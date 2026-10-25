"""BreezyVoice 台灣腔 AI 語音服務。

模型只載入一次常駐在記憶體，Node 後端透過 HTTP 呼叫：
  GET  /health                 → {"ready": bool}
  POST /synthesize             → 依句子合成並接成一個 WAV，回傳每句的起訖秒數
      {"segments": [...], "prompt_audio": "參考音檔路徑", "prompt_text": "參考音檔的逐字稿",
       "speed": 1.0, "output": "輸出 WAV 路徑"}
請求依序處理（單執行緒），避免同時佔用過多記憶體。
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "BreezyVoice")
MODEL_DIR = os.path.join(ROOT, "models", "BreezyVoice")
sys.path[:0] = [os.path.join(ROOT, "shims"), REPO, os.path.join(REPO, "third_party", "Matcha-TTS")]
os.chdir(REPO)
os.environ.setdefault("PYTHONUTF8", "1")

import torch  # noqa: E402
import torchaudio  # noqa: E402

PORT = int(os.environ.get("BREEZY_PORT", "8790"))
SAMPLE_RATE = 22050
state = {"ready": False, "error": None, "model": None, "g2pw": None, "prompts": {}}


def load():
    try:
        t0 = time.time()
        import single_inference as si  # noqa: E402  模組載入時會把執行緒設成 1，載入後再調回來
        from g2pw import G2PWConverter

        # M1 有 4 顆效能核心，用 4 條執行緒最快
        torch.set_num_threads(int(os.environ.get("BREEZY_THREADS", "4")))
        state["si"] = si
        state["model"] = si.CustomCosyVoice(MODEL_DIR)
        g2pw = G2PWConverter()
        # macOS 上 DataLoader 開子行程會重新執行主程式而卡住，改成在同一個行程處理
        g2pw.num_workers = 0
        state["g2pw"] = g2pw
        state["ready"] = True
        print(f"BreezyVoice ready in {time.time() - t0:.1f}s", flush=True)
    except Exception as e:  # 載入失敗時讓 /health 回報原因
        state["error"] = repr(e)
        print("BreezyVoice failed to load:", repr(e), flush=True)


def prompt_features(path, text):
    """參考音檔的特徵每次都一樣，快取起來"""
    key = (path, os.path.getmtime(path), text)
    if key not in state["prompts"]:
        si, model = state["si"], state["model"]
        speech = si.load_wav(path, 16000)
        norm = model.frontend.text_normalize_new(text, split=False)
        state["prompts"][key] = (speech, si.get_bopomofo_rare(norm, state["g2pw"]))
    return state["prompts"][key]


def synthesize(body):
    si, model = state["si"], state["model"]
    speech, prompt_text = prompt_features(body["prompt_audio"], body["prompt_text"])
    speed = float(body.get("speed", 1.0))
    pieces, segments, t = [], [], 0.0
    for text in body["segments"]:
        norm = model.frontend.text_normalize_new(text, split=False)
        bopomo = si.get_bopomofo_rare(norm, state["g2pw"])
        model_input = model.frontend.frontend_zero_shot(bopomo, prompt_text, speech)
        wav = model.model.inference(**model_input)["tts_speech"]
        if abs(speed - 1.0) > 0.01:
            import librosa

            wav = torch.from_numpy(librosa.effects.time_stretch(wav.squeeze(0).numpy(), rate=speed)).unsqueeze(0)
        # 句子之間留一點停頓，聽起來比較自然
        pause = torch.zeros(1, int(SAMPLE_RATE * 0.18))
        pieces += [wav, pause]
        dur = wav.shape[1] / SAMPLE_RATE
        segments.append({"text": text, "start": t, "end": t + dur})
        t += dur + 0.18
    audio = torch.cat(pieces[:-1], dim=1)
    torchaudio.save(body["output"], audio.clamp(-1, 1), SAMPLE_RATE, encoding="PCM_S", bits_per_sample=16)
    return {"segments": segments, "duration": audio.shape[1] / SAMPLE_RATE}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ready": state["ready"], "error": state["error"]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/synthesize":
            return self._send(404, {"error": "not found"})
        if not state["ready"]:
            return self._send(503, {"error": state["error"] or "模型載入中，請稍候"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            t0 = time.time()
            result = synthesize(body)
            print(f"synthesized {len(body['segments'])} segments, {result['duration']:.1f}s audio in {time.time() - t0:.1f}s", flush=True)
            self._send(200, result)
        except Exception as e:
            self._send(500, {"error": repr(e)})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    threading.Thread(target=load, daemon=True).start()
    print(f"BreezyVoice service on http://127.0.0.1:{PORT}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

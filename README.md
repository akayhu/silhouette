# 剪影 Studio — 線上影片剪輯網站

好上手的線上短影音剪輯工具，淺色介面，含會員登入與訂閱（免費版／專業版 NT$399／月）。

## 啟動

```bash
npm install
npm run dev
```

打開 http://localhost:5173 。`npm run dev` 會同時啟動前端（Vite，5173）和後端 API（Node，8787）。

## 功能

| 功能 | 說明 |
|---|---|
| 會員 | Email＋密碼註冊／登入、修改名稱與密碼。Google 登入按鈕已放好，需設定 OAuth 用戶端 ID 才能使用 |
| 訂閱 | 免費版：每月 3 個專案、720p、浮水印；專業版：不限專案、1080p、無浮水印、AI 功能。目前是**本機模擬付款**（不會扣款），可取消／恢復訂閱、有付款紀錄 |
| 剪輯 | 多軌時間軸（字幕／主軌／音訊）、分割（⌘B）、拖曳修剪、拖曳調整順序、變速、音量、9:16／16:9／1:1、復原／重做、自動儲存 |
| 轉場 | 溶解、閃白、閃黑、左推、右推、上推、拉近、模糊、擦除、圓形展開；點主軌片段間的 ◇ 設定，可一鍵套用到全部，聲音會交叉淡化 |
| 字幕 | 手動新增、6 種樣式範本、字型／大小／顏色／描邊／底色／位置、5 種進場動畫 |
| AI 自動字幕 | 瀏覽器內執行 Whisper（第一次下載約 80 MB 模型），自動轉繁體中文 |
| 智能口播 | 分析音量自動剪掉停頓，可剪掉只有「嗯、啊」的口誤字幕，字幕與配音會跟著對齊 |
| 文字朗讀 | 台灣腔 AI 人聲（BreezyVoice，可錄音建立自己的聲音）＋ macOS 內建語音，並自動依句子加上對齊的字幕；也可把每句字幕轉成語音 |
| 音樂庫 | 8 首原創配樂（輕快、Lo-fi、溫馨、動感、電子、可愛、氛圍）＋ 8 個音效，可試聽、搜尋、依風格篩選；加入時自動配合影片長度並淡出 |
| 去水印 | 自動偵測固定位置的浮水印，或在預覽上手動框選；可選智能填補、模糊、馬賽克，套用到同一素材的所有片段，匯出也會套用 |
| 匯出 | MP4（瀏覽器不支援時為 WebM），依影片長度即時錄製 |

## 台灣腔 AI 人聲（BreezyVoice）

朗讀的「台灣腔 AI 人聲」使用聯發科開源的 [BreezyVoice](https://github.com/mtkresearch/BreezyVoice)，在這台電腦上執行，不需帳號、不送資料到外部。

- 安裝（約 3 GB，只要一次）：`./scripts/setup-ai-voice.sh`
- 沒安裝時，朗讀面板只會顯示 macOS 系統語音，其他功能不受影響
- 內建聲音：曉涵（台灣腔女聲）。使用者可以錄一段約 10 秒的朗讀「建立我的聲音」，每人最多 10 個
- 速度：在 M1／8GB 上每句約 30–60 秒，第一次使用要多等約 20 秒載入模型；閒置 10 分鐘後自動關閉以釋放記憶體
- 程式位置：`tts/service.py`（常駐服務，埠號 8790，由 API 伺服器自動啟動）、`tts/voices/`（內建聲音）、`tts/shims/`（取代 macOS 裝不起來的中文正規化套件）

## 音樂庫

音樂庫的曲目由 `scripts/generate-music.mjs` 用程式合成（原創、無版權），輸出到 `server/music/`，清單在 `server/music/library.json`。重新產生：

```bash
node scripts/generate-music.mjs
```

想加入自己找的無版權音樂（例如 CC0 授權）：把 `.m4a` 或 `.mp3` 放進 `server/music/`，再到 `library.json` 的 `items` 加一筆（`id`、`title`、`category` 填 `music` 或 `sfx`、`mood`、`duration`、`url`、`peaks` 可填空陣列）。注意重新執行產生腳本會覆蓋 `library.json`。

## 測試帳號

本機開發時建立的測試帳號（已升級專業版）：

- Email：`demo@jianying.test`
- 密碼：`demo-pass-2026`

## 資料位置

- 資料庫：`server/data/app.db`（SQLite）
- 上傳檔案：`server/data/uploads/`

刪掉 `server/data` 資料夾即可重置所有資料。

## 上線前要補的

- **金流**：把 `server/index.mjs` 的 `/api/billing/checkout` 換成 Stripe Checkout＋Webhook（目前只檢查卡號格式）
- **Google 登入**：設定 OAuth 用戶端 ID
- **文字朗讀**：目前依賴 macOS 的 `say` 指令，部署到 Linux 伺服器需改用雲端 TTS（例如 Google Cloud TTS、Azure Speech）
- **檔案儲存**：上傳檔案目前存在本機硬碟，正式環境建議改用 S3 等物件儲存

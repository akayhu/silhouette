---
version: 1
slug: "src-pages-landing-tsx"
primary_target: "src/pages/Landing.tsx"
related_targets: ["src/components/Layout.tsx","src/components/Plans.tsx","src/pages/Auth.tsx"]
---

# 首頁（/）與行銷頁、登入註冊

Mode: Persuade。訪客：台灣個人創作者、小店家與接案者。要相信：加入一支手機影片，片刻剪趣幾分鐘就剪好可發佈的版本，而且影片留在自己的電腦。行動：免費註冊開始剪輯。證據：產品實際畫面與輸出，示範內容標示「示範」，不捏造評價、獎項或使用數據。

## Direction contract

THESIS: 一套明亮、以產品為主角的創作者軟體官網：大標置中、巨大的編輯器視窗、功能分頁、數字帶、三步驟、收尾色帶。使用者指定參考某剪輯軟體官網的節奏，但不照抄：不用深色主視覺、不用藍色、不放評價與獎項。

OWN-WORLD: 白底與淺灰帶（#f4f5f7）、墨黑字（#16171b）、品牌紅（#d42c22）承擔所有行動與重點詞、陽光黃（#ffc94a）只用在螢光筆標記。Noto Sans TC 900 大標、Plus Jakarta Sans 數字。圓角 20–28px 的面板、膠囊按鈕、一個柔和陰影。

STORY: 首屏看到編輯器在做事 → 分頁看 AI 五件事（自動剪輯、AI 字幕、文字剪輯、智能模板、雙語字幕）→ 數字帶 → 本機剪輯（含換裝置需重新提供素材）→ 三步驟 → 完整功能 → 適合誰（示範）→ 方案 → 問答 → 紅色收尾帶。

FIRST VIEWPORT: 置中大標「打開瀏覽器，一次剪好一支短影音」與副標、紅色膠囊 CTA；下方大型瀏覽器視窗框住真實編輯器畫面，左下疊一支播放示範的手機，周圍浮著「剪掉空拍 −11.6 秒」「自動字幕 6 句」「影片留在你的電腦」標籤。

FORM: 使用者指定的參考網站節奏（明亮版）。簽名互動：AI 功能分頁，切換時右側示範跟著換；自動剪輯分頁內的手機示範可點選效果。

FINISH: code-led（使用者用量有限）；一輪桌機＋手機截圖、detect，更新 DESIGN.md。

## 素材

- 示範照片（Unsplash，頁尾標註攝影師）：甜不辣攤 photo-1665898362159-616b0ade1044（Roméo A.）、蒸籠備料 photo-1583560266880-bdd37ea65fe0（Robson Hatsukami Morgan）、烤香腸 photo-1593960548354-62d1b5c9d542（Brandon Lee）。
- 編輯器實際畫面：public/editor-demo.jpg、editor-demo-mobile.jpg。貼紙用產品原創貼紙。

## 未決

- 正式網域未定（影響 canonical、sitemap）。

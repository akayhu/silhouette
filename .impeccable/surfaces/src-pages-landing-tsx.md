---
version: 1
slug: "src-pages-landing-tsx"
primary_target: "src/pages/Landing.tsx"
related_targets: ["src/components/Layout.tsx","src/components/Plans.tsx"]
---

# 首頁（/）

Mode: Persuade。訪客：台灣個人創作者、小店家與接案者。要相信：上傳一支手機影片，片刻剪趣幾分鐘就剪好可發佈的版本，而且影片留在自己的電腦。行動：免費註冊開始剪輯。證據：產品實際輸出（字幕、貼紙、特寫、轉場）與編輯器實際畫面，示範內容標示「示範」，不捏造評價或數據。

## Direction contract

THESIS: 首頁是一本台灣生活雜誌《片刻剪趣》的創刊號：封面、編輯室報告、特輯、功能索引、跨頁、人物、問與答、封底。拒絕 SaaS 套版（置中標題＋一排一樣大的功能卡）與上一版的收據世界。

OWN-WORLD: 未塗佈雜誌紙白（#f5f6f3，不是奶油色）地面、墨黑內文（#1b1b19）、一個大面積「期色」鈷藍（#2343c8）承擔封面色塊、目錄與封底；品牌紅只留在 logo 紅點。明體（Noto Serif TC 900）做標題與頁碼、霞鶩文楷做手寫註記、黑體做內文。細線（1px 墨色 15%）分欄，版頭版尾（刊名＋頁碼）是結構，不是眉標。沒有陰影卡片、沒有漸層、沒有 mono。

STORY: 封面一眼看懂「影片丟進來，剪好的出來」→ 編輯室報告說明本機剪輯與換裝置需重新提供素材 → 特輯：五個模板 → 功能索引 → 編輯器跨頁 → 四種人的剪法（示範）→ 方案 → 問與答 → 封底再按一次開始。

FIRST VIEWPORT: 雜誌封面：左側直排明體大標「打開瀏覽器，一次剪好一支短影音」，中間鈷藍色塊上放 9:16 手機示範（台灣小吃三段）與迷你時間軸，右側是封面標題式的「本期內容」清單（剪掉空拍 4 段 −11.6 秒…），可點選切換手機效果；刊頭有 ISSUE 01 與期別。

FORM: 台灣生活雜誌（《小日子》類），使用者指定的方向。簽名互動：封面標題清單點一行，手機只播該效果；自動輪播可暫停、重播。

FINISH: code-led（使用者用量有限，跳過 comp 回合與審查代理）；一輪桌機＋手機截圖檢查、detect，最後更新 DESIGN.md。

## 素材

- 示範照片（Unsplash License，熱連結 images.unsplash.com，頁尾標註攝影師）：
  - 甜不辣攤：photo-1665898362159-616b0ade1044，Roméo A.（@gronemo）
  - 蒸籠備料：photo-1583560266880-bdd37ea65fe0，Robson Hatsukami Morgan（@robsonhmorgan）
  - 烤香腸：photo-1593960548354-62d1b5c9d542，Brandon Lee（@sangsara）
- 編輯器實際畫面：public/editor-demo.jpg、editor-demo-mobile.jpg。
- 貼紙使用產品自己的原創貼紙（src/lib/stickers.ts）。

## 未決

- 正式網域未定（影響 canonical、sitemap）。

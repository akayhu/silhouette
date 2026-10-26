---
version: 1
slug: "src-pages-landing-tsx"
primary_target: "src/pages/Landing.tsx"
related_targets: ["src/components/Layout.tsx","src/components/Plans.tsx"]
---

# 首頁（/）

Mode: Persuade。訪客：台灣個人創作者、小店家與接案者。要相信：上傳一支手機影片，片刻剪趣幾分鐘就剪好可發佈的版本。行動：免費註冊開始剪輯。證據：產品實際輸出（字幕、貼紙、特寫、轉場），示範內容標示「示範」，不捏造評價或數據。

## Direction contract

THESIS: 丟進一支影片，拿回一張逐項列出「剪掉什麼、加了什麼」的剪輯明細單。拒絕 AI SaaS 套版：漸層光暈、星星徽章、置中標題加瀏覽器截圖、一排一樣大的功能卡。

OWN-WORLD: 不鏽鋼收銀台的淺灰（#e3e7ea）是地面，熱感應紙白（#f7f8f5）的長條單據是主要容器，碳黑印字（#18191d），發票紅（#e0352b）大面積承擔行動與總計。鋸齒撕線、點線前導、條碼、蓋章式的「專業版」標記。字體：Chiron Hei HK（中文）、Martian Mono（數字與品項）。不用卡片陰影堆疊、不用漸層、不用 emoji。

STORY: 一眼看懂「影片進去、剪好的出來」→ 點單據上的品項看到每個自動效果 → 看完整明細（全部功能與數量）→ 四種常見訂單（口播、Vlog、店家、教學）→ 價格 → 注意事項（FAQ）→ 紅色總計區塊再按一次開始。

FIRST VIEWPORT: 左 5/12：大標「打開瀏覽器，三分鐘剪好一支短影音」、一句說明、紅色「免費開始剪輯」與次要連結、7 天專業版小字。右 7/12：9:16 手機畫面播放三段台灣小吃示範（甜不辣攤、蒸籠、烤香腸），下方迷你時間軸顯示空拍被剪掉；手機右側斜貼一張正在列印的明細單，最下方海報級「總計 00:29」。

FORM: 超商熱感應收據／電子發票證明聯，我的清單第 7 名，seed 7f18c41f。簽名互動：點明細單任一行，手機只播該效果；自動輪播可暫停、重播，每次相同。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 素材

- 示範照片（Unsplash License，熱連結 images.unsplash.com，頁面標註攝影師）：
  - 甜不辣攤：photo-1665898362159-616b0ade1044，Roméo A.（@gronemo）
  - 蒸籠備料：photo-1583560266880-bdd37ea65fe0，Robson Hatsukami Morgan（@robsonhmorgan）
  - 烤香腸：photo-1593960548354-62d1b5c9d542，Brandon Lee（@sangsara）
- 貼紙使用產品自己的原創貼紙（src/lib/stickers.ts）。

## 未決

- 正式網域未定（影響 canonical、sitemap）。

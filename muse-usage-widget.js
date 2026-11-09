// Muse 使用量ウィジェット (Scriptable)
// Muse が GitHub に公開している usage.json を読んで表示します。
// 使い方: Scriptable に新規スクリプトを作り、この内容を貼り付けて保存。
// ホーム画面のウィジェット（中サイズ推奨）でこのスクリプトを選んでください。

const DATA_URL = "https://raw.githubusercontent.com/gottaTS/muse-usage/main/usage.json";
const CACHE_FILE = "muse-usage-cache.json";

async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      return JSON.parse(fm.readString(cachePath));
    }
    throw e;
  }
}

function makeBar(percent) {
  const w = 260, h = 10, r = 5;
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const bg = new Path();
  bg.addRoundedRect(new Rect(0, 0, w, h), r, r);
  dc.addPath(bg);
  dc.setFillColor(new Color("#8E8E93", 0.35));
  dc.fillPath();
  const filled = Math.max(r * 2, Math.min(w, (w * percent) / 100));
  const fg = new Path();
  fg.addRoundedRect(new Rect(0, 0, filled, h), r, r);
  dc.addPath(fg);
  dc.setFillColor(percent >= 90 ? new Color("#FF3B30") : percent >= 70 ? new Color("#FF9500") : new Color("#0A84FF"));
  dc.fillPath();
  return dc.getImage();
}

function fmtReset(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.ceil((d - now) / 86400000);
  const md = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return days > 0 ? `${md}（あと${days}日）` : md;
}

function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 更新`;
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.setPadding(14, 16, 14, 16);
  let data = null;
  try {
    data = await loadData();
  } catch (e) {
    const t = widget.addText("Muse 使用量を取得できませんでした");
    t.font = Font.semiboldSystemFont(13);
    return widget;
  }

  const title = widget.addText("Muse 週間使用量");
  title.font = Font.semiboldSystemFont(13);
  title.textColor = Color.gray();
  widget.addSpacer(4);

  const pct = data.weekly ? data.weekly.used_percent : null;
  if (pct !== null && pct !== undefined) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.bottomAlignContent();
    const big = row.addText(`${pct}%`);
    big.font = Font.boldSystemFont(34);
    row.addSpacer(6);
    const used = row.addText("使用済み");
    used.font = Font.systemFont(12);
    used.textColor = Color.gray();
    widget.addSpacer(6);
    widget.addImage(makeBar(pct));
    widget.addSpacer(8);
    const reset = widget.addText(`リセット: ${fmtReset(data.weekly.resets_at)}`);
    reset.font = Font.systemFont(12);
  }

  if (data.additional_tokens) {
    widget.addSpacer(4);
    const extra = widget.addText(
      `追加トークン: ${data.additional_tokens.used_percent}% 使用（残り ${data.additional_tokens.remaining_text.replace(" tokens left", "")}）`
    );
    extra.font = Font.systemFont(12);
    extra.textColor = Color.gray();
  }

  widget.addSpacer();
  const upd = widget.addText(fmtUpdated(data.updated_at));
  upd.font = Font.systemFont(10);
  upd.textColor = Color.gray();

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();

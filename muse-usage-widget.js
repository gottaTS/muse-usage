// Muse 使用量ウィジェット (Scriptable)
// Muse が GitHub に公開している usage.json を読んで表示します。
// 使い方: Scriptable で新規スクリプトを作り、この内容を全部貼り付けて保存。
// ホーム画面のウィジェットの設定で、このスクリプトを選んでください。

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

function makeBarImage(percent) {
  // 表示領域より大きく描く。Scriptable が表示幅に合わせて縮小するので、
  // バーは文字の列とぴったり同じ幅（左右いっぱい）になる。
  const W = 300, H = 22, r = 11;
  const dc = new DrawContext();
  dc.size = new Size(W, H);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const bg = new Path();
  bg.addRoundedRect(new Rect(0, 0, W, H), r, r);
  dc.addPath(bg);
  dc.setFillColor(new Color("#8E8E93", 0.35));
  dc.fillPath();
  const filled = Math.max(r * 2, Math.min(W, (W * percent) / 100));
  const fg = new Path();
  fg.addRoundedRect(new Rect(0, 0, filled, H), r, r);
  dc.addPath(fg);
  dc.setFillColor(percent >= 90 ? new Color("#FF3B30") : percent >= 70 ? new Color("#FF9500") : new Color("#0A84FF"));
  dc.fillPath();
  return dc.getImage();
}

function resetParts(iso) {
  if (!iso) return { md: "", days: null };
  const d = new Date(iso);
  const now = new Date();
  const days = Math.ceil((d - now) / 86400000);
  const md = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { md, days: days > 0 ? days : null };
}

function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 更新`;
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.setPadding(12, 12, 12, 12);
  const data = await loadData();

  const title = widget.addText("Muse 週間使用量");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = Color.gray();
  widget.addSpacer(4);

  const pct = data.weekly ? data.weekly.used_percent : null;
  if (pct !== null && pct !== undefined) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.bottomAlignContent();
    const big = row.addText(`${pct}%`);
    big.font = Font.boldSystemFont(30);
    row.addSpacer(6);
    const used = row.addText("使用済み");
    used.font = Font.systemFont(11);
    used.textColor = Color.gray();
    widget.addSpacer(6);
    widget.addImage(makeBarImage(pct));
    widget.addSpacer(8);
    const rp = resetParts(data.weekly.resets_at);
    const reset = widget.addText(`リセット: ${rp.md}`);
    reset.font = Font.systemFont(11);
    if (rp.days !== null) {
      widget.addSpacer(2);
      const dl = widget.addText(`あと${rp.days}日`);
      dl.font = Font.systemFont(11);
      dl.textColor = Color.gray();
    }
  }

  if (data.additional_tokens) {
    widget.addSpacer(4);
    const rest = data.additional_tokens.remaining_text.replace(" tokens left", "");
    const extra = widget.addText(
      `追加: ${data.additional_tokens.used_percent}%（残り ${rest}）`
    );
    extra.font = Font.systemFont(11);
    extra.textColor = Color.gray();
  }

  widget.addSpacer();
  const upd = widget.addText(fmtUpdated(data.updated_at));
  upd.font = Font.systemFont(10);
  upd.textColor = Color.gray();

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return widget;
}

async function main() {
  const widget = await buildWidget();
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    widget.presentMedium();
  }
}

try {
  await main();
} catch (e) {
  const errWidget = new ListWidget();
  const t = errWidget.addText("読み込みエラー");
  t.font = Font.semiboldSystemFont(13);
  const m = errWidget.addText(String(e && e.message ? e.message : e));
  m.font = Font.systemFont(11);
  m.textColor = Color.red();
  if (config.runsInWidget) {
    Script.setWidget(errWidget);
  } else {
    errWidget.presentMedium();
  }
}
Script.complete();

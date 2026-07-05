/* =====================================================================
   GETC 海外研修 価格計算ツール
   構成: state(入力値は文字列で保持) → computeAll(純関数) → render
   ===================================================================== */
"use strict";

/* ---------- utils ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const rnd = v => Math.round(v);
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmt = n => rnd(n).toLocaleString("ja-JP");
const man = n => (rnd(n)/10000).toLocaleString("ja-JP",{minimumFractionDigits:1, maximumFractionDigits:1}) + "万円";
const pct = n => isFinite(n) ? (n*100).toFixed(1) + "%" : "—";
const gpCls = r => !isFinite(r) ? "" : r < .10 ? "gp-bad" : r < .20 ? "gp-warn" : "gp-ok";

const TAXCATS = ["課税","非課税","不課税","対象外","未確認"];
const FLIGHT_NOTE = "航空券は貴社直接手配、または旅行会社から貴社へ直接請求を想定しており、当社見積には含めておりません。";
const CURRENCIES = ["SGD","USD","EUR","GBP","AUD","CAD","NZD","JPY"];
const LTTYPES = ["GST","VAT","Sales Tax","その他","なし"];

/* ---------- 既定の外貨ブロック ---------- */
const fxBlock = (cur, over={}) => Object.assign({
  currency: cur, rateMode: "common", customRate: "", jpyCost: "",
  ltType: "GST", ltMode: "incl", ltRate: ""
}, over);

/* ---------- 既定パターンデータ ---------- */
function defaultPatternData(){
  return {
    basic: { country:"シンガポール", city:"シンガポール", startDate:"", endDate:"",
      participants:"16", geStaff:"1", clientStaff:"1",
      lecturers:"0", lecturerStay:false, lecturerFlight:false, groups:"4" },
    pre: {
      kickoff: { on:true, sell:"350000", cost:"0", taxCat:"課税", note:"" },
      orient:  { on:true, sell:"300000", cost:"0", taxCat:"課税", note:"" },
      rows: [
        { id:uid(), name:"異文化理解研修", lecturer:"", times:"1", hours:"3", days:"1", sell:"", gpIn:"0", matUnit:"0", taxCat:"課税", note:"" }
      ]
    },
    cg: { on:true, name:"Alby", targetGroups:"4", preCnt:"2", localCnt:"2", postCnt:"0",
          hoursPer:"1", unit:"70000", costRate:"50", taxCat:"課税", note:"" },
    cm: [
      { id:uid(), company:"", preCnt:"1", localCnt:"2", postCnt:"0", hoursPer:"1",
        unit:"50000", costRate:"50", taxCat:"課税", note:"" }
    ],
    partner: {
      name:"inlingua Singapore", country:"シンガポール", city:"シンガポール", note:"",
      program: [
        Object.assign({ id:uid(), name:"プログラム費用", desc:"", qty:"1", unitLabel:"式", fxUnit:"",
          markup:"0", taxCat:"不課税", note:"" }, fxBlock("SGD",{ltRate:"9"}))
      ],
      party: [
        Object.assign({ id:uid(), name:"懇親会", people:"18", fxTotal:"",
          markup:"0", taxCat:"不課税", note:"" }, fxBlock("SGD",{ltRate:"9"}))
      ],
      transport: [
        Object.assign({ id:uid(), name:"空港送迎", desc:"往復", times:"2", vehicles:"1", fxUnit:"",
          markup:"0", taxCat:"不課税", note:"" }, fxBlock("SGD",{ltRate:"9"}))
      ],
      other: []
    },
    guests: [],
    ma: { on:true, company:"", agency:"", person:"", sell:"1000000", cost:"", taxCat:"課税", note:"" },
    buddy: { on:true, agency:"CURIO Japan", people:"4", daysPer:"5", hoursPerDay:"6", unit:"10000",
             costUnit:"10000", mtgCnt:"1", mtgUnit:"10000", mtgCost:"", taxCat:"課税", note:"" },
    hotels: [
      Object.assign({ id:uid(), on:true, name:"Hotel Chancellor", city:"シンガポール", roomType:"シングル",
        people:"18", nights:"6", rooms:"18", fxUnit:"230",
        sell:"", breakfast:"込み", taxSvc:"込み", cancel:"", taxCat:"不課税", note:"" },
        fxBlock("SGD",{ltRate:"9"}))
    ],
    flight: { arrange:"GE見積に含める", people:"16", unit:"", cost:"", taxCat:"課税", note:"" },
    others: [
      { id:uid(), name:"外国籍ビザ申請費用", sell:"300000", cost:"0", taxCat:"課税",
        note:"実費費用(翻訳費用など)が請求費用を上回った場合には追加でご請求をいたします。" }
    ],
    al: [ { id:uid(), person:"", days:"7", unit:"50000", cost:"", taxCat:"課税", note:"" } ],
    ad: [ { id:uid(), person:"", days:"2", unit:"50000", cost:"", taxCat:"課税", note:"" } ],
    mgmt: { ratePct:"10",
      targets:{ pre:true, consult:true, partner:true, guest:true, ma:true, buddy:true,
                hotel:true, flight:false, al:true, ad:true, others:false },
      cost:"0", taxCat:"課税", note:"" }
  };
}

function defaultState(){
  const pid = uid();
  return {
    basic: { project:"海外ミッション型研修 価格計算", client:"", note:"" },
    fx: { currency:"SGD", tts:"115.00", markupPct:"105", ltType:"GST", ltMode:"incl", ltRate:"9" },
    taxRate: "10",
    patterns: [ { id: pid, name:"1週間ライト", comment:"", data: defaultPatternData() } ],
    active: pid
  };
}

/* ---------- persistence (複数案件対応) ---------- */
const LSKEY = "getc-training-calc-v2";
const LSKEY_V1 = "getc-training-calc-v1";
let ROOT;   // { cases:[case,…], activeId }
let S;      // 表示中の案件(case) = { id, updatedAt, basic, fx, taxRate, patterns, active }
function newCase(projectName){
  const c = defaultState();
  c.id = uid(); c.updatedAt = Date.now();
  if (projectName != null) c.basic.project = projectName;
  return c;
}
function setActiveCase(id){
  S = ROOT.cases.find(c => c.id === id) || ROOT.cases[0];
  ROOT.activeId = S.id;
}
function load(){
  try {
    const raw = localStorage.getItem(LSKEY);
    if (raw){ ROOT = JSON.parse(raw);
      if (!ROOT.cases || !ROOT.cases.length) throw 0;
      setActiveCase(ROOT.activeId); return; }
  } catch(e){}
  try {
    // 旧バージョン(単一案件)からの引き継ぎ
    const raw = localStorage.getItem(LSKEY_V1);
    if (raw){ const old = JSON.parse(raw);
      if (old.patterns && old.basic){
        old.id = uid(); old.updatedAt = Date.now();
        ROOT = { cases:[old], activeId: old.id };
        setActiveCase(old.id); return; } }
  } catch(e){}
  const c = newCase();
  ROOT = { cases:[c], activeId: c.id };
  S = c;
}
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    S.updatedAt = Date.now();
    try{ localStorage.setItem(LSKEY, JSON.stringify(ROOT)); }catch(e){}
  }, 300);
}
function activePat(){ return S.patterns.find(p => p.id === S.active) || S.patterns[0]; }
/* 旧データへの後付けフィールド補完 */
function migrate(){
  for (const c of ROOT.cases){
    if (c.basic.lecturers == null && c.basic.participants != null){
      c.basic.lecturers = "0"; c.basic.lecturerStay = false; c.basic.lecturerFlight = false; }
    for (const p of c.patterns){
      if (p.data.basic == null){
        const b = c.basic;
        p.data.basic = { country: b.country || "", city: b.city || "",
          startDate: b.startDate || "", endDate: b.endDate || "",
          participants: b.participants ?? "16", geStaff: b.geStaff ?? "1", clientStaff: b.clientStaff ?? "1",
          lecturers: b.lecturers ?? "0", lecturerStay: !!b.lecturerStay, lecturerFlight: !!b.lecturerFlight,
          groups: b.groups ?? "4" };
      }
    }
    if (c.fx.ltType == null){ c.fx.ltType = "GST"; c.fx.ltMode = "incl"; c.fx.ltRate = "9"; }
    for (const p of c.patterns){
      for (const r of p.data.pre.rows)
        if (r.gpIn == null) r.gpIn = String(num(r.sell) - num(r.cost));
      for (const r of p.data.partner.party)
        if (r.fxTotal == null) r.fxTotal = String(num(r.people) * num(r.times) * num(r.fxUnit));
      for (const k of ["program","party","transport","other"])
        for (const r of p.data.partner[k]) if (r.markup == null) r.markup = "0";
      for (const r of p.data.guests) if (r.markup == null) r.markup = "0";
      if (p.data.buddy.costUnit == null) p.data.buddy.costUnit = p.data.buddy.unit || "10000";
      for (const r of p.data.pre.rows) if (r.matUnit == null) r.matUnit = "0";
      if (p.data.others == null) p.data.others = [
        { id: uid(), name:"外国籍ビザ申請費用", sell:"300000", cost:"0", taxCat:"課税",
          note:"実費費用(翻訳費用など)が請求費用を上回った場合には追加でご請求をいたします。" } ];
      if (p.data.mgmt.targets.others == null) p.data.mgmt.targets.others = false;
    }
  }
}

/* ---------- path helpers (data-p) ---------- */
function resolve(path){
  // 先頭トークン: basic / fx / taxRate / patName / patComment / pat.…
  const parts = path.split(".");
  const head = parts.shift();
  if (head === "taxRate") return { obj: S, key: "taxRate" };
  if (head === "patName") return { obj: activePat(), key: "name" };
  if (head === "patComment") return { obj: activePat(), key: "comment" };
  let obj;
  if (head === "basic") obj = S.basic;
  else if (head === "fx") obj = S.fx;
  else if (head === "pat") obj = activePat().data;
  else return null;
  while (parts.length > 1) {
    let k = parts.shift();
    obj = Array.isArray(obj) ? obj[parseInt(k,10)] : obj[k];
    if (obj == null) return null;
  }
  return { obj, key: parts[0] };
}
function setPath(path, value){
  const r = resolve(path);
  if (r && r.obj) r.obj[r.key] = value;
}

/* =====================================================================
   計算エンジン（純関数）: パターンデータ → 計算結果
   丸めルール: 明細行ごとに円未満四捨五入。消費税も明細ごとに計算・四捨五入。
   ===================================================================== */
function commonRate(){ return num(S.fx.tts) * num(S.fx.markupPct) / 100; }
function patBasic(pd){ return (pd || activePat().data).basic; }
function tripNightsFor(pb){
  if (!pb.startDate || !pb.endDate) return null;
  const d = (new Date(pb.endDate) - new Date(pb.startDate)) / 86400000;
  return d >= 0 ? Math.round(d) : null;
}
function tripWeeksFor(pb){
  const n = tripNightsFor(pb);
  return n != null ? Math.ceil((n + 1) / 7) : null;
}
function stayCountFor(pb){
  return num(pb.participants) + num(pb.geStaff) + num(pb.clientStaff)
       + (pb.lecturerStay ? num(pb.lecturers) : 0);
}
/* 表示中パターン用のショートハンド */
function tripNights(){ return tripNightsFor(patBasic()); }
function tripWeeks(){ return tripWeeksFor(patBasic()); }
function stayCount(){ return stayCountFor(patBasic()); }

/* 外貨行 → 円換算原価。現地税(税別)は外貨小計に加算してから換算。 */
function fxCost(row, fxSub){
  if (row.rateMode === "jpy") return rnd(num(row.jpyCost));
  let sub = fxSub;
  if (row.ltMode === "excl" && row.ltType !== "なし") sub *= (1 + num(row.ltRate)/100);
  const rate = row.rateMode === "custom" ? num(row.customRate) : commonRate();
  return rnd(sub * rate);
}
function ltFlag(row){
  if (row.rateMode === "jpy" || row.ltType === "なし") return "";
  if (row.ltMode === "unknown") return "unknown";
  if (row.ltMode === "excl") return "excl";
  return "";
}

/* 行の共通仕上げ: 売価・原価 → 粗利・消費税 */
function finish(sell, cost, taxCat, taxRatePct){
  sell = rnd(sell); cost = rnd(cost);
  const gp = sell - cost;
  const gpRate = sell !== 0 ? gp / sell : NaN;
  const tax = taxCat === "課税" ? rnd(sell * taxRatePct / 100) : 0;
  return { sell, cost, gp, gpRate, tax };
}

const zero = () => ({ sell:0, cost:0, gp:0, tax:0, taxable:0 });
function acc(sum, r){ sum.sell += r.sell; sum.cost += r.cost; sum.gp += r.gp; sum.tax += r.tax;
  if (r.tax > 0) sum.taxable += r.sell; return sum; }

function computeAll(pd){
  const tr = num(S.taxRate);
  const R = {};                       // rowId → computed
  const cat = {};                     // カテゴリ集計
  const detail = [];                  // 課税・粗利サマリー用の項目別内訳
  const D = (label, r) => detail.push({ label, r });
  const ceilMan = v => Math.ceil(v / 10000) * 10000;
  let taxUnknown = 0, ltUnknown = 0, ltExcl = 0;
  const track = r => { if (r.taxCatUsed === "未確認") taxUnknown++; };
  const trackLt = f => { if (f === "unknown") ltUnknown++; if (f === "excl") ltExcl++; };

  /* --- 事前研修・オリエンテーション --- */
  cat.pre = zero();
  const fixed = [["kickoff","キックオフ"],["orient","出発前オリエンテーション"]];
  for (const [k, label] of fixed){
    const it = pd.pre[k];
    const r = finish(num(it.sell), num(it.cost), it.taxCat, tr);
    r.taxCatUsed = it.taxCat; R["pre-"+k] = r; track(r);
    if (it.on){ acc(cat.pre, r); D(label, r); }
  }
  const pb = pd.basic || patBasic();
  const ppl = num(pb.participants);
  for (const row of pd.pre.rows){
    const mat = num(row.matUnit) * ppl;             // 教材費 = 単価 × 参加者数(粗利なし)
    const base = num(row.sell) + mat;
    const sell = base > 0 ? Math.ceil(base / 100000) * 100000 : 0;   // 10万円単位に切り上げ(交通費等込み)
    const gp = row.gpIn != null ? num(row.gpIn) : num(row.sell) - num(row.cost);
    const r = finish(sell, sell - gp, row.taxCat, tr);
    r.mat = mat; r.base = base;
    r.taxCatUsed = row.taxCat; R[row.id] = r; track(r); acc(cat.pre, r);
    D("事前研修:" + (row.name || "(無名)") + (mat ? "(教材費込)" : ""), r);
  }

  /* --- コンサルティング --- */
  cat.consult = zero();
  { const c = pd.cg;
    const totalCnt = num(c.targetGroups) * (num(c.preCnt)+num(c.localCnt)+num(c.postCnt));
    const totalH = totalCnt * num(c.hoursPer);
    const sell = totalH * num(c.unit);
    const cost = rnd(sell * num(c.costRate)/100);
    const r = finish(sell, cost, c.taxCat, tr);
    Object.assign(r, { totalCnt, totalH, taxCatUsed: c.taxCat });
    R["cg"] = r; track(r);
    if (c.on){ acc(cat.consult, r); D("コンサルティング(" + (c.name || "班別") + ")", r); }
  }
  const cmGroups = num(pd.cg.targetGroups) || 1;
  for (const row of pd.cm){
    const totalH = cmGroups * (num(row.preCnt)+num(row.localCnt)+num(row.postCnt)) * num(row.hoursPer);
    const sell = totalH * num(row.unit);
    const cost = rnd(sell * num(row.costRate)/100);
    const r = finish(sell, cost, row.taxCat, tr);
    Object.assign(r, { totalH, taxCatUsed: row.taxCat });
    R[row.id] = r; track(r); acc(cat.consult, r);
    D("ミッション企業コンサル(" + (row.company || "未設定") + ")", r);
  }

  /* --- 現地提携先費用 --- */
  cat.partner = zero();
  const gFx = { rateMode:"common", customRate:"", jpyCost:"",
    ltType: S.fx.ltType, ltMode: S.fx.ltMode, ltRate: S.fx.ltRate };
  const pRows = [
    ...pd.partner.program.map(r => [r, num(r.qty) * num(r.fxUnit), "プログラム/会場"]),
    ...pd.partner.party.map(r => [r, num(r.fxTotal), "懇親会"]),
    ...pd.partner.transport.map(r => [r, num(r.times) * num(r.vehicles) * num(r.fxUnit), "交通/送迎"]),
    ...pd.partner.other.map(r => [r, num(r.qty) * num(r.fxUnit), "提携先その他"])
  ];
  for (const [row, fxSub, catLab] of pRows){
    const raw = fxCost(gFx, fxSub);
    const cost = ceilMan(raw);
    const sell = cost + num(row.markup);
    const r = finish(sell, cost, row.taxCat, tr);
    r.fxSub = fxSub; r.raw = raw; r.lt = ltFlag(gFx); r.taxCatUsed = row.taxCat;
    R[row.id] = r; track(r); trackLt(r.lt);
    acc(cat.partner, r);
    D(catLab + ":" + (row.name || "(無名)"), r);
  }

  /* --- ゲストスピーカー / 企業訪問 --- */
  cat.guestPartner = zero(); cat.guestDirect = zero();
  for (const row of pd.guests){
    const fxSub = num(row.qty) * num(row.fxUnit);
    const raw = fxCost(gFx, fxSub);
    const cost = ceilMan(raw);
    const sell = cost + num(row.markup);
    const r = finish(sell, cost, row.taxCat, tr);
    r.fxSub = fxSub; r.raw = raw; r.lt = ltFlag(gFx); r.taxCatUsed = row.taxCat;
    R[row.id] = r;
    if (row.on){ track(r); trackLt(r.lt);
      acc(row.payVia === "direct" ? cat.guestDirect : cat.guestPartner, r);
      D(row.type + "(" + (row.name || "無名") + ")", r); }
  }

  /* --- ミッション企業手配 --- */
  cat.ma = zero();
  { const m = pd.ma;
    const r = finish(num(m.sell), num(m.cost), m.taxCat, tr);
    r.taxCatUsed = m.taxCat; R["ma"] = r; track(r);
    if (m.on){ acc(cat.ma, r); D("ミッション企業手配", r); }
  }

  /* --- バディ --- */
  cat.buddy = zero();
  { const b = pd.buddy;
    const totalH = num(b.people) * num(b.daysPer) * num(b.hoursPerDay);
    const sellLocal = totalH * num(b.unit);
    const costLocal = totalH * num(b.costUnit != null ? b.costUnit : b.unit);   // 原価 = 原価時間単価(手入力) × 総稼働時間
    const rL = finish(sellLocal, costLocal, b.taxCat, tr);
    Object.assign(rL, { totalH, taxCatUsed: b.taxCat });
    R["buddy-local"] = rL;
    const mtgTotalCnt = (num(pd.cg.targetGroups) || 1) * num(b.mtgCnt);
    const sellMtg = mtgTotalCnt * num(b.mtgUnit);
    const costMtg = mtgTotalCnt * num(b.mtgCost);   // 原価 = 原価単価(手入力) × 合計回数
    const rM = finish(sellMtg, costMtg, b.taxCat, tr);
    rM.totalCnt = mtgTotalCnt;
    rM.taxCatUsed = b.taxCat; R["buddy-mtg"] = rM;
    if (b.on){ track(rL); acc(cat.buddy, rL); acc(cat.buddy, rM);
      D("バディ(現地稼働)", rL); if (rM.sell || rM.cost) D("バディ(オンラインMTG)", rM); }
  }

  /* --- 海外プログラム費用(限定提携先 + バディ)を1人あたり単価 × 参加者数に整形。
         単価は万円単位に切り上げ、端数は粗利に計上。 --- */
  let ppUnit = null;
  { const lump = cat.partner.sell + cat.buddy.sell;
    if (ppl > 0 && lump > 0){
      ppUnit = Math.ceil(lump / ppl / 10000) * 10000;
      const adj = ppUnit * ppl - lump;
      if (adj > 0){
        cat.partner.sell += adj; cat.partner.gp += adj;
        D("海外プログラム費用 端数調整(1人単価を万単位に切上げ)", { sell: adj, cost: 0, gp: adj, gpRate: 1, tax: 0 });
      }
    }
  }

  /* --- ホテル --- */
  cat.hotel = zero();
  const hotelNights = tripNightsFor(pb) || 0;
  const hPeople = stayCountFor(pb);
  for (const row of pd.hotels){
    const fxSub = num(row.rooms) * hotelNights * num(row.fxUnit);
    const raw = fxCost(gFx, fxSub);
    const cost = ceilMan(raw);
    const unitPP = hPeople > 0 && cost > 0 ? Math.ceil(cost / hPeople / 10000) * 10000 : cost;   // 1人あたり(万円単位に切上げ)
    const sellH = hPeople > 0 && cost > 0 ? unitPP * hPeople : cost;
    const r = finish(sellH, cost, row.taxCat, tr);   // 売価 = 1人単価 × 宿泊人数(端数分は粗利)
    r.unitPP = unitPP; r.hPeople = hPeople;
    r.fxSub = fxSub; r.raw = raw; r.lt = ltFlag(gFx); r.taxCatUsed = row.taxCat;
    R[row.id] = r;
    if (row.on){ track(r); trackLt(r.lt); acc(cat.hotel, r);
      D("ホテル(" + (row.name || "無名") + ")", r); }
  }

  /* --- 航空券 --- */
  cat.flight = zero();
  const f = pd.flight;
  const fDirect = (f.arrange === "貴社直接手配" || f.arrange === "旅行会社から貴社へ直接請求");
  const fPeople = num(pb.participants) + num(pb.geStaff) + num(pb.clientStaff)
    + (pb.lecturerFlight ? num(pb.lecturers) : 0);
  { const sell = fPeople * num(f.unit);   // 単価が空欄なら0円=実質含まれない
    const r = finish(sell, sell, f.taxCat, tr);   // 原価・粗利は扱わない(粗利0)
    r.people = fPeople;
    r.taxCatUsed = f.taxCat; R["flight"] = r;
    track(r); acc(cat.flight, r);
    if (sell) D("航空券", r);
  }

  /* --- アテンド --- */
  cat.al = zero(); cat.ad = zero();
  for (const [key, rows, lab] of [["al", pd.al, "現地アテンド"], ["ad", pd.ad, "国内アテンド"]]){
    for (const row of rows){
      const sell = num(row.days) * num(row.unit);
      const r = finish(sell, 0, row.taxCat, tr);   // 原価は管理しない
      r.taxCatUsed = row.taxCat; R[row.id] = r; track(r);
      acc(cat[key], r);
      D(lab, r);
    }
  }

  /* --- その他費用 --- */
  cat.others = zero();
  for (const row of pd.others){
    const r = finish(num(row.sell), num(row.cost), row.taxCat, tr);
    r.taxCatUsed = row.taxCat; R[row.id] = r; track(r);
    acc(cat.others, r);
    D("その他:" + (row.name || "(無名)"), r);
  }

  /* --- 企画・管理費 --- */
  const tgt = pd.mgmt.targets;
  const targetMap = {
    pre: cat.pre.sell, consult: cat.consult.sell,
    partner: cat.partner.sell + cat.guestPartner.sell,
    guest: cat.guestDirect.sell, ma: cat.ma.sell, buddy: cat.buddy.sell,
    hotel: cat.hotel.sell, flight: cat.flight.sell, al: cat.al.sell, ad: cat.ad.sell,
    others: cat.others.sell
  };
  let mgmtBase = 0;
  for (const k in targetMap) if (tgt[k]) mgmtBase += targetMap[k];
  const mgmtSell = rnd(mgmtBase * num(pd.mgmt.ratePct)/100);
  { const r = finish(mgmtSell, 0, pd.mgmt.taxCat, tr);   // 全額が粗利
    r.base = mgmtBase; r.taxCatUsed = pd.mgmt.taxCat; R["mgmt"] = r; track(r);
    cat.mgmt = zero(); acc(cat.mgmt, r);
    D("企画・管理費", r);
  }

  /* --- 合計 --- */
  const total = zero();
  const catKeys = ["pre","consult","partner","guestPartner","guestDirect","ma","buddy","hotel","flight","al","ad","others","mgmt"];
  for (const k of catKeys){ const c = cat[k];
    total.sell += c.sell; total.cost += c.cost; total.gp += c.gp; total.tax += c.tax; total.taxable += c.taxable; }
  const gpRate = total.sell ? total.gp / total.sell : NaN;
  const pp = ppl || 1;

  /* --- freee転記用明細(項目ごと・単価×数量) ---
     まとめない方針。現地提携先のメイン費用のみ1本に合算し、
     ゲストスピーカー/企業訪問は行ごとに独立。 */
  const freee = [];
  const ST = (label, ...cs) => {
    const t = cs.reduce((a,c) => ({ sell: a.sell + c.sell, tax: a.tax + c.tax }), { sell:0, tax:0 });
    freee.push({ label: "◆ " + label, subtotal: true, taxCat: "", unit: null, qty: null, qtyUnit: "",
      ex: t.sell, tax: t.tax, inc: t.sell + t.tax, note: "", excluded: false });
  };
  const L = (label, r, taxCat, opt={}) => freee.push({
    label, taxCat,
    unit: opt.unit ?? r.sell, qty: opt.qty ?? 1, qtyUnit: opt.qtyUnit ?? "式",
    ex: r.sell, tax: r.tax, inc: r.sell + r.tax,
    note: opt.note ?? "", excluded: false });

  if (pd.pre.kickoff.on) L("キックオフ", R["pre-kickoff"], pd.pre.kickoff.taxCat, {note:"定額"});
  if (pd.pre.orient.on)  L("出発前オリエンテーション", R["pre-orient"], pd.pre.orient.taxCat, {note:"定額"});
  for (const row of pd.pre.rows)
    L(`事前研修${row.name ? "(" + row.name + ")" : ""}`, R[row.id], row.taxCat,
      { note: [row.lecturer && "講師:"+row.lecturer, num(row.times) ? "実施"+num(row.times)+"回" : "",
               R[row.id].mat ? "教材費 " + fmt(num(row.matUnit)) + "円×" + ppl + "名込" : ""].filter(Boolean).join(" / ") });
  ST("事前研修・オリエンテーション 合計", cat.pre);

  if (pd.cg.on) L(`コンサルティング${pd.cg.name ? "(" + pd.cg.name + ")" : ""}`, R["cg"], pd.cg.taxCat,
      { unit: num(pd.cg.unit), qty: R["cg"].totalH, qtyUnit: "時間" });
  for (const row of pd.cm)
    L(`ミッション企業コンサルティング${row.company ? "(" + row.company + ")" : ""}`, R[row.id], row.taxCat,
      { unit: num(row.unit), qty: R[row.id].totalH, qtyUnit: "時間" });
  ST("コンサルティング 合計", cat.consult);

  { const c = zero(); acc(c, cat.partner); acc(c, cat.buddy);
    const perPerson = ppUnit != null;
    freee.push({ label: "海外プログラム費用",
      taxCat: c.tax > 0 ? (c.taxable === c.sell ? "課税" : "混在") : "非課税等",
      unit: perPerson ? ppUnit : c.sell, qty: perPerson ? ppl : 1, qtyUnit: perPerson ? "名" : "式",
      ex: c.sell, tax: c.tax, inc: c.sell + c.tax,
      note: `限定提携先(${pd.partner.name || "現地提携先"})プログラム費・バディ手配費(現地/渡航前オンライン)を合算。1人あたり単価(万円単位)× 参加者数`, excluded: false }); }

  for (const row of pd.guests){ if (!row.on) continue;
    L(`${row.type}${row.name ? "(" + row.name + ")" : ""}`, R[row.id], row.taxCat,
      { note: row.payVia === "partner" ? "現地提携先経由" : "直接支払い" }); }

  if (pd.ma.on) L(`ミッション企業手配費${pd.ma.company ? "(" + pd.ma.company + ")" : ""}`, R["ma"], pd.ma.taxCat);

  for (const row of pd.hotels){ if (!row.on) continue;
    const rr = R[row.id];
    L(`ホテル費${row.name ? "(" + row.name + ")" : ""}`, rr, row.taxCat,
      { unit: rr.unitPP, qty: rr.hPeople || 1, qtyUnit: "名",
        note: `${num(row.rooms)}室 × ${hotelNights}泊。1人あたり(万円単位)× 宿泊人数` }); }
  L("航空券", R["flight"], f.taxCat,
    { unit: num(f.unit), qty: fPeople, qtyUnit: "名",
      note: fDirect ? FLIGHT_NOTE : (num(f.unit) ? "" : "単価未入力のため0円(見積に含めない場合は空欄のまま)") });
  ST("ホテル・航空券 合計", cat.hotel, cat.flight);

  for (const [key, rows, lab] of [["al", pd.al, "現地アテンド費"], ["ad", pd.ad, "国内アテンド費"]])
    for (const row of rows)
      L(lab, R[row.id], row.taxCat,
        { unit: num(row.unit), qty: num(row.days), qtyUnit: "日" });
  ST("アテンド費 合計", cat.al, cat.ad);

  for (const row of pd.others)
    L(`その他費用(${row.name || "無名"})`, R[row.id], row.taxCat, { note: row.note });

  L("企画・管理費", R["mgmt"], pd.mgmt.taxCat,
    { note: `対象 ${fmt(R["mgmt"].base)}円 × ${num(pd.mgmt.ratePct)}%` });

  return {
    R, cat, freee, detail,
    totals: { ex: total.sell, cost: total.cost, gp: total.gp, gpRate,
      tax: total.tax, inc: total.sell + total.tax,
      taxableEx: total.taxable, nonTaxEx: total.sell - total.taxable,
      ppEx: rnd(total.sell / pp), ppInc: rnd((total.sell + total.tax) / pp) },
    flightNote: fDirect,
    warn: { taxUnknown, ltUnknown, ltExcl }
  };
}

/* =====================================================================
   描画ヘルパー
   ===================================================================== */
const inp  = (p,v,cls="",ph="") => `<input data-p="${p}" class="${cls}" value="${esc(v)}" placeholder="${esc(ph)}">`;
let CUR_FOCUS = null;   // 編集中の欄はカンマ整形せず生の値を表示
function fmtInputVal(v){
  if (v === "" || v == null) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isFinite(n)) return v;
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 6 });
}
const ninp = (p,v,cls="w-m") => `<input data-p="${p}" data-t="num" class="num ${cls}" inputmode="decimal" value="${esc(p === CUR_FOCUS ? v : fmtInputVal(v))}">`;
const dinp = (p,v) => `<input type="date" data-p="${p}" value="${esc(v)}">`;
const sel  = (p,v,opts,cls="") => `<select data-p="${p}" class="${cls}">` +
  opts.map(o => { const [val,lab] = Array.isArray(o) ? o : [o,o];
    return `<option value="${esc(val)}"${String(val)===String(v)?" selected":""}>${esc(lab)}</option>`; }).join("") + `</select>`;
const chk  = (p,v,lab) => `<label class="sw"><input type="checkbox" data-p="${p}" data-t="bool"${v?" checked":""}> ${lab}</label>`;
const curSel = (p,v) => `<input data-p="${p}" list="curlist" class="w-s" style="width:64px" value="${esc(v)}">`;
const comp = (t,cls="") => `<div class="comp ${cls}">${t}</div>`;
const F    = (lab,inner) => `<div class="f"><label>${esc(lab)}</label>${inner}</div>`;
const td   = c => `<td>${c}</td>`;
const taxSel = (p,v) => sel(p, v, TAXCATS) + (v==="未確認" ? `<span class="badge warn">未確認</span>` : "");
const delBtn = (tbl,id) => `<button class="del" data-act="delRow" data-tbl="${tbl}" data-id="${id}" title="行を削除">✕</button>`;
const addBtn = (tbl,lab) => `<button class="addrow" data-act="addRow" data-tbl="${tbl}">＋ ${lab}</button>`;
const onSw = (p,v) => chk(p, v, "見積に含める");
const secH = (no,title,extra="") => `<h2><span class="secno">${no}</span>${title}${extra}</h2>`;
const gpTds = r => td(comp(fmt(r.gp), gpCls(r.gpRate))) + td(comp(pct(r.gpRate), gpCls(r.gpRate)));

/* =====================================================================
   セクション描画
   ===================================================================== */
const NAV = [
  ["basic","基本情報"],["fx","為替・計算レート"],["pre","事前研修・国内準備"],
  ["consult","コンサルティング"],["partner","現地提携先費用"],["guest","ゲストスピーカー/企業訪問"],
  ["ma","ミッション企業手配"],["buddy","バディ手配"],["hotel","ホテル"],["flight","航空券"],
  ["attend","アテンド費用"],["mgmt","企画・管理費"],["others","その他費用"],["tax","課税・粗利サマリー"],
  ["freee","freee転記用サマリー"],["compare","パターン比較"]
];

function renderNav(){
  document.getElementById("nav").innerHTML =
    NAV.map(([id,lab],i) => `<a href="#sec-${id}"><span class="no">${String(i+1).padStart(2,"0")}</span>${lab}</a>`).join("");
}

function renderPatbar(){
  const tabs = S.patterns.map(p =>
    `<div class="ptab${p.id===S.active?" active":""}" data-act="switchPat" data-id="${p.id}">${esc(p.name||"(無題)")}</div>`).join("");
  document.getElementById("patbar").innerHTML = tabs +
    `<button class="pbtn" data-act="dupPat">＋ このパターンを複製</button>` +
    (S.patterns.length > 1 ? `<button class="pbtn" data-act="delPat" style="color:#b3261e;border-color:#efb2ae">パターン削除</button>` : "");
}

function renderSumbar(C){
  const t = C.totals;
  const cell = (lbl,val,sub,cls="") =>
    `<div class="sum-cell ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="man">${sub||""}</div></div>`;
  const g = !isFinite(t.gpRate) ? "" : t.gpRate < .10 ? "gp-bad" : t.gpRate < .20 ? "gp-warn" : "gp-ok";
  document.getElementById("sumbar").innerHTML =
    cell("税別合計", fmt(t.ex)+"円", man(t.ex)) +
    cell("税込合計", fmt(t.inc)+"円", man(t.inc)) +
    cell("1人あたり税別", fmt(t.ppEx)+"円", man(t.ppEx)) +
    cell("粗利", fmt(t.gp)+"円", man(t.gp), g) +
    cell("粗利率", pct(t.gpRate), "", g);
}

function renderCasebar(){
  const opts = ROOT.cases.map(c =>
    `<option value="${c.id}"${c.id===S.id?" selected":""}>${esc(c.basic.project||"(無題の案件)")}${c.basic.client?" / "+esc(c.basic.client):""}</option>`).join("");
  document.getElementById("casectl").innerHTML =
    `<select id="casesel" title="案件を切り替え">${opts}</select>
     <button data-act="newCase">＋新規案件</button>
     <button data-act="dupCase">案件複製</button>` +
    (ROOT.cases.length > 1 ? `<button data-act="delCase">案件削除</button>` : "");
}

/* 年度(4月始まり)とタブ名 */
function fiscalLabel(){
  const pbf = patBasic();
  let d = pbf.startDate ? new Date(pbf.startDate) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  const fy = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return fy + "年度";
}
function tabNameFor(){
  const base = (S.basic.client || S.basic.project || "案件").trim()
    .replace(/[\[\]\*\/\\\?:]/g, "").slice(0, 60);
  return base + "_" + fiscalLabel();
}
/* 案件情報の行 */
function caseInfoRows(){
  return [
    ["案件名", S.basic.project],
    ["顧客名", S.basic.client || ""],
    ["計算レート", "TTS " + num(S.fx.tts) + " × " + num(S.fx.markupPct) + "% = " + commonRate().toFixed(4)],
    ["最終更新", new Date().toLocaleString("ja-JP")]
  ];
}
/* 1パターン分の明細行 */
function patternRows(p){
  const rows = [];
  const push = (...a) => rows.push(a);
  const C = computeAll(p.data);
  const pb = p.data.basic;
  const nights = tripNightsFor(pb);
  push("■ パターン:" + (p.name || "(無題)"), p.comment || "");
  push("国 / 都市", (pb.country || "") + " / " + (pb.city || ""));
  push("参加者数", num(pb.participants) + "名(GE事務局" + num(pb.geStaff) + "名・先方事務局" + num(pb.clientStaff) + "名・講師" + num(pb.lecturers) + "名)");
  push("渡航期間", (pb.startDate || "未定") + " 〜 " + (pb.endDate || "未定") +
    (nights != null ? "(" + nights + "泊" + (nights+1) + "日・" + tripWeeksFor(pb) + "週間)" : ""));
  push("品目名","税区分","単価(円)","数量","単位","計算式","税別金額(円)","消費税(円)","税込金額(円)","備考");
  for (const l of C.freee){
    if (l.subtotal){ push(l.label, "", "", "", "", "", l.ex, l.tax, l.inc, ""); continue; }
    if (l.excluded){ push(l.label, "対象外", "", "", "", "", "", "", "", l.note); continue; }
    const formula = l.qtyUnit === "式" ? "一式"
      : fmt(l.unit) + " × " + l.qty.toLocaleString("ja-JP") + l.qtyUnit + " = " + fmt(l.ex);
    push(l.label, l.taxCat, l.unit, l.qty, l.qtyUnit, formula, l.ex, l.tax, l.inc, l.note);
  }
  push("合計", "", "", "", "", "", C.totals.ex, C.totals.tax, C.totals.inc, "");
  push("1人あたり", "", "", "", "", "", C.totals.ppEx, "", C.totals.ppInc, "税別 / 税込");
  push("原価合計", C.totals.cost, "粗利合計", C.totals.gp, "粗利率", pct(C.totals.gpRate));
  if (C.flightNote) push("注記", FLIGHT_NOTE);
  if (C.warn.taxUnknown) push("警告", "課税区分が未確認の項目が " + C.warn.taxUnknown + " 件あります");
  if (C.warn.ltUnknown) push("警告", "現地税(GST/VAT)が未確認の項目が " + C.warn.ltUnknown + " 件あります");
  return rows;
}
const padRows = rows => { const w = Math.max(...rows.map(r => r.length), 1);
  return rows.map(r => { while (r.length < w) r.push(""); return r.map(v => v == null ? "" : v); }); };
/* 数値セルに3桁区切り書式を適用 */
function applyNumFmt(ws){
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = range.s.r; r <= range.e.r; r++)
    for (let c = range.s.c; c <= range.e.c; c++){
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "#,##0";
    }
}
/* Excel書き出し: 顧客名_年度.xlsx(案件情報シート + パターンごとのシート) */
function exportExcel(){
  if (typeof XLSX === "undefined"){
    alert("Excel出力ライブラリを読み込めませんでした。ネットワーク接続を確認してページを再読み込みしてください。");
    return;
  }
  const wb = XLSX.utils.book_new();
  const sanitize = s => String(s || "").replace(/[\[\]\*\/\\\?:]/g, "").trim() || "パターン";
  const COLS = [{wch:36},{wch:9},{wch:12},{wch:8},{wch:6},{wch:26},{wch:14},{wch:12},{wch:14},{wch:40}];

  // 案件情報 + パターン比較
  const info = caseInfoRows();
  info.push([]);
  info.push(["パターン比較"]);
  info.push(["パターン名","期間","税別合計","消費税","税込合計","1人あたり税別","1人あたり税込","原価合計","粗利合計","粗利率","コメント"]);
  for (const p of S.patterns){
    const C = computeAll(p.data);
    const nn = tripNightsFor(p.data.basic);
    info.push([p.name || "(無題)", nn != null ? nn + "泊" + (nn+1) + "日" : "", C.totals.ex, C.totals.tax, C.totals.inc,
      C.totals.ppEx, C.totals.ppInc, C.totals.cost, C.totals.gp, pct(C.totals.gpRate), p.comment || ""]);
  }
  const wsInfo = XLSX.utils.aoa_to_sheet(padRows(info));
  wsInfo["!cols"] = [{wch:18},{wch:16},{wch:12},{wch:10},{wch:12},{wch:14},{wch:14},{wch:12},{wch:12},{wch:9},{wch:24}];
  applyNumFmt(wsInfo);
  XLSX.utils.book_append_sheet(wb, wsInfo, "案件情報");

  // パターンごとのシート(シート名は31文字制限)
  const used = new Set(["案件情報"]);
  S.patterns.forEach((p, idx) => {
    let name = sanitize(p.name).slice(0, 28) || ("パターン" + (idx + 1));
    let base = name, n = 2;
    while (used.has(name)) name = base.slice(0, 25) + "(" + (n++) + ")";
    used.add(name);
    const ws = XLSX.utils.aoa_to_sheet(padRows(patternRows(p)));
    ws["!cols"] = COLS;
    applyNumFmt(ws);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  XLSX.writeFile(wb, tabNameFor() + ".xlsx");
}
function secBasic(){
  const b = S.basic, p = activePat(), pb = p.data.basic;
  const grp = num(pb.groups);
  const perGroup = grp ? (num(pb.participants)/grp) : 0;
  const warnReq = (!b.project || !num(pb.participants)) ?
    `<div class="alertbox">必須項目(案件名・参加者数)が未入力です。</div>` : "";
  return `<section class="card" id="sec-basic">${secH(1,"基本情報")}
  <div class="body">
    <div class="grid">
      ${F("案件名 *(全パターン共通)", inp("basic.project", b.project))}
      ${F("顧客名(全パターン共通)", inp("basic.client", b.client))}
      ${F("案件備考(全パターン共通)", inp("basic.note", b.note))}
    </div>
    <h3>このパターンの条件(パターンごとに独立)</h3>
    <div class="grid">
    ${F("パターン名", inp("patName", p.name, "", "例:1週間ライト"))}
    ${F("国", inp("pat.basic.country", pb.country))}
    ${F("都市", inp("pat.basic.city", pb.city))}
    ${F("現地提携先名", inp("pat.partner.name", p.data.partner.name))}
    ${F("渡航開始日", dinp("pat.basic.startDate", pb.startDate))}
    ${F("渡航終了日", dinp("pat.basic.endDate", pb.endDate))}
    ${F("参加者数 *", ninp("pat.basic.participants", pb.participants))}
    ${F("GE事務局人数", ninp("pat.basic.geStaff", pb.geStaff))}
    ${F("先方事務局人数", ninp("pat.basic.clientStaff", pb.clientStaff))}
    ${F("講師の人数", ninp("pat.basic.lecturers", pb.lecturers))}
    ${F("講師分の加算", chk("pat.basic.lecturerStay", pb.lecturerStay, "宿泊に加算") + " " + chk("pat.basic.lecturerFlight", pb.lecturerFlight, "航空券に加算"))}
    ${F("宿泊数(日程から自動)", comp(tripNights() != null ? tripNights() + "泊" + (tripNights()+1) + "日" : "日程を入力してください"))}
    ${F("週数(日程から自動)", comp(tripWeeks() != null ? tripWeeks() + "週間" : "—"))}
    ${F("合計宿泊人数(自動)", comp(fmt(stayCount())+" 名"))}
    ${F("班数", ninp("pat.basic.groups", pb.groups))}
    ${F("1班あたり人数", comp(perGroup ? perGroup.toFixed(1)+" 名" : "—"))}
    ${F("パターン備考", inp("patComment", p.comment))}
    </div>${warnReq}</div></section>`;
}

/* --- 2. 為替 --- */
function secFx(){
  const f = S.fx;
  return `<section class="card" id="sec-fx">${secH(2,"為替・計算レート")}
  <div class="body">
    <div class="grid">
      ${F("基準通貨", curSel("fx.currency", f.currency))}
      ${F("TTSレート", ninp("fx.tts", f.tts))}
      ${F("上乗せ率(%)", ninp("fx.markupPct", f.markupPct))}
      ${F("計算レート(自動)", comp(commonRate().toFixed(4), "big"))}
    </div>
    <a class="addrow" style="display:inline-block;text-decoration:none;margin-top:8px" target="_blank" rel="noopener"
       href="https://www.murc-kawasesouba.jp/fx/index.php">↗ 本日のTTSレートを確認(三菱UFJリサーチ&コンサルティング)</a>
    <h3>現地税(GST/VAT)の共通設定</h3>
    <div class="grid">
      ${F("税の種類", sel("fx.ltType", f.ltType, LTTYPES))}
      ${F("見積への含まれ方", sel("fx.ltMode", f.ltMode, [["incl","税込(原価に含まれている)"],["excl","税別(原価に自動加算する)"],["unknown","未確認"]]))}
      ${F("現地税率(%)", ninp("fx.ltRate", f.ltRate))}
    </div>
    <p class="hint">現地提携先費用(第5章)の円換算は、この共通計算レートと現地税設定を自動で使用します。「税別」を選ぶと外貨小計に現地税を加算してから円換算します。ホテル・ゲストスピーカーは行ごとに個別設定できます。円未満は明細行ごとに四捨五入します。</p>
    <details class="help"><summary>現地税(GST/VAT)とは — 入力前に確認</summary>
      <p>GST(Goods and Services Tax)やVAT(Value Added Tax)は、海外の消費税に相当する税金です。現地提携先・ホテル・交通機関などの請求額に含まれる(または加算される)ことがあります。</p>
      <ul>
        <li>シンガポール:GST 9%</li>
        <li>オーストラリア:GST 10% / ニュージーランド:GST 15%</li>
        <li>イギリス:VAT 20% / EU諸国:VAT 約19〜25%(国により異なる)</li>
        <li>カナダ:GST 5% + 州税 / アメリカ:国レベルのVATなし(州・市のSales Taxに注意)</li>
      </ul>
      <p><strong>注意点</strong></p>
      <ul>
        <li>提携先の見積・請求が「税込(inclusive)」か「税別(exclusive)」かを必ず確認する</li>
        <li>税別の場合、現地税分を原価に加算しないと粗利が過大に見える(このツールでは「税別」を選ぶと自動加算)</li>
        <li>税率は改定されることがあるため、必ず最新の税率を提携先の請求書等で確認して入力する</li>
        <li>現地税は日本の消費税とは別物。海外役務に対する日本側の課税区分は通常「不課税」</li>
      </ul>
    </details>
  </div></section>`;
}

/* --- 3. 事前研修 --- */
function secPre(C){
  const pre = activePat().data.pre;
  const fixedRow = (key,label) => { const it = pre[key], r = C.R["pre-"+key];
    return `<tr class="${it.on?"":"off"}">
      ${td(onSw(`pat.pre.${key}.on`, it.on))}${td(esc(label))}
      ${td(ninp(`pat.pre.${key}.sell`, it.sell))}${td(ninp(`pat.pre.${key}.cost`, it.cost))}
      ${gpTds(r)}${td(taxSel(`pat.pre.${key}.taxCat`, it.taxCat))}<td></td>
      ${td(inp(`pat.pre.${key}.note`, it.note,"w-l"))}<td></td></tr>`; };
  const rows = pre.rows.map((row,i) => { const bp = `pat.pre.rows.${i}`, r = C.R[row.id];
    return `<tr>${td("")}${td(inp(bp+".name",row.name,"w-l","研修名") + inp(bp+".lecturer",row.lecturer,"w-m","講師名"))}
      ${td(ninp(bp+".sell",row.sell) + `<div class="man">確定 ${fmt(r.sell)}円(10万切上げ)</div>`)}${td(comp(fmt(r.cost)))}
      ${td(ninp(bp+".gpIn",row.gpIn))}${td(comp(pct(r.gpRate), gpCls(r.gpRate)))}${td(taxSel(bp+".taxCat",row.taxCat))}
      ${td(ninp(bp+".matUnit",row.matUnit,"w-s") + `<div class="man">合計 ${fmt(r.mat||0)}円(×${num(patBasic().participants)}名・粗利なし)</div>`)}
      ${td(`<span class="man">回数</span>`+ninp(bp+".times",row.times,"w-s")
         + `<span class="man">時間/回</span>`+ninp(bp+".hours",row.hours,"w-s")
         + `<span class="man">日数</span>`+ninp(bp+".days",row.days,"w-s")
         + inp(bp+".note",row.note,"w-m","備考"))}
      ${td(delBtn("preRows",row.id))}</tr>`; }).join("");
  return `<section class="card" id="sec-pre">${secH(3,"事前研修・国内準備")}
  <div class="body"><div class="tw"><table class="tbl">
    <tr><th></th><th>項目</th><th>売価</th><th>原価</th><th>粗利</th><th>粗利率</th><th>課税区分</th><th>教材費単価/人</th><th>回数・時間・備考</th><th></th></tr>
    <tr><td colspan="10" class="hint" style="padding:4px 8px">キックオフ・オリエンは原価を入力(粗利は自動)。追加した事前研修行は<strong>粗利を入力</strong>(原価は自動計算)。教材費は単価×参加者数で自動加算(粗利なし)。事前研修行の売価は教材費加算後に<strong>10万円単位へ切り上げ</strong>(交通費等込み。切り上げ差額は原価側に計上され、粗利は入力どおり)。</td></tr>
    ${fixedRow("kickoff","キックオフ(定額)")}
    ${fixedRow("orient","出発前オリエンテーション(定額)")}
    ${rows}
  </table></div>${addBtn("preRows","事前研修を追加")}</div></section>`;
}

/* --- 4. コンサルティング --- */
function secConsult(C){
  const pd = activePat().data, c = pd.cg, r = C.R["cg"];
  const cmRows = pd.cm.map((row,i) => { const bp = `pat.cm.${i}`, rr = C.R[row.id];
    return `<tr>${td(inp(bp+".company",row.company,"w-l","対象企業名"))}
      ${td(ninp(bp+".preCnt",row.preCnt,"w-s"))}${td(ninp(bp+".localCnt",row.localCnt,"w-s"))}${td(ninp(bp+".postCnt",row.postCnt,"w-s"))}
      ${td(ninp(bp+".hoursPer",row.hoursPer,"w-s"))}${td(comp(rr.totalH+" h"))}
      ${td(ninp(bp+".unit",row.unit))}${td(comp(fmt(rr.sell)))}
      ${td(ninp(bp+".costRate",row.costRate,"w-s"))}${td(comp(fmt(rr.cost)))}
      ${gpTds(rr)}${td(taxSel(bp+".taxCat",row.taxCat))}
      ${td(inp(bp+".note",row.note,"w-m"))}${td(delBtn("cm",row.id))}</tr>`; }).join("");
  return `<section class="card" id="sec-consult">${secH(4,"コンサルティング")}
  <div class="body">
    <h3>4-1. コンサルタントによる班ごとのコンサルティング ${onSw("pat.cg.on", c.on)}</h3>
    <div class="grid">
      ${F("コンサルタント名", inp("pat.cg.name", c.name))}
      ${F("対象班数", ninp("pat.cg.targetGroups", c.targetGroups))}
      ${F("渡航前回数/班", ninp("pat.cg.preCnt", c.preCnt))}
      ${F("現地中回数/班", ninp("pat.cg.localCnt", c.localCnt))}
      ${F("帰国後回数/班", ninp("pat.cg.postCnt", c.postCnt))}
      ${F("1回あたり時間", ninp("pat.cg.hoursPer", c.hoursPer))}
      ${F("合計回数(自動)", comp(r.totalCnt+" 回"))}
      ${F("合計時間(自動)", comp(r.totalH+" 時間"))}
      ${F("時間単価(円)", ninp("pat.cg.unit", c.unit))}
      ${F("売価(自動)", comp(fmt(r.sell)+"円","big"))}
      ${F("原価率(%)", ninp("pat.cg.costRate", c.costRate))}
      ${F("原価(自動)", comp(fmt(r.cost)+"円"))}
      ${F("粗利", comp(fmt(r.gp)+"円", gpCls(r.gpRate)))}
      ${F("粗利率", comp(pct(r.gpRate), gpCls(r.gpRate)))}
      ${F("課税区分", taxSel("pat.cg.taxCat", c.taxCat))}
      ${F("備考", inp("pat.cg.note", c.note))}
    </div>
    <p class="hint">例:4班 × (渡航前2回+現地2回) × 1時間 = 16時間 × 70,000円 = 1,120,000円</p>
    <h3>4-2. ミッション企業とのコンサルティング</h3>
    <p class="hint">回数は<strong>1班あたり</strong>で入力してください。上の対象班数(現在 ${esc(c.targetGroups)}班)を自動で掛けて合計時間を計算します。</p>
    <div class="tw"><table class="tbl">
      <tr><th>対象企業名</th><th>渡航前/班</th><th>現地中/班</th><th>帰国後/班</th><th>時間/回</th><th>合計時間(班数込み)</th>
      <th>単価</th><th>売価</th><th>原価率%</th><th>原価</th><th>粗利</th><th>粗利率</th><th>課税区分</th><th>備考</th><th></th></tr>
      ${cmRows}
    </table></div>${addBtn("cm","ミッション企業コンサルを追加")}
  </div></section>`;
}

/* --- 5. 現地提携先費用 --- */
/* 円換算原価セル: 万円と「単価×数量」の内訳を併記 */
function costFormulaCell(r, qty, qtyUnit){
  const q = num(qty);
  let sub = man(r.cost);
  if (q > 1) sub += ` | ${fmt(rnd(r.raw / q))}円×${q}${qtyUnit}=${fmt(r.raw)}円`;
  else if (r.raw !== r.cost) sub += ` | 切上げ前 ${fmt(r.raw)}円`;
  return td(`<div class="comp"><strong>${fmt(r.cost)}</strong>円<div class="man">${sub}</div></div>`);
}

function partnerTable(C, key, title, qtyCols, opts = {}){
  const rows = activePat().data.partner[key];
  const showGp = opts.showGp !== false;
  const body = rows.map((row,i) => { const bp = `pat.partner.${key}.${i}`, r = C.R[row.id];
    const qty = opts.qtyOf ? opts.qtyOf(row) : 1;
    return `<tr>${td(inp(bp+".name",row.name,"w-l","詳細名"))}
      ${qtyCols.map(([k,,cls]) => td(k==="desc" ? inp(bp+".desc",row.desc,"w-m") : ninp(bp+"."+k,row[k],cls||"w-s"))).join("")}
      ${opts.totalInput
        ? td(ninp(bp+".fxTotal",row.fxTotal))
        : td(ninp(bp+".fxUnit",row.fxUnit)) + td(comp(r.fxSub.toLocaleString("ja-JP",{maximumFractionDigits:2})))}
      ${costFormulaCell(r, qty, opts.qtyUnit || "")}
      ${td(ninp(bp+".markup",row.markup,"w-s"))}
      ${td(comp(fmt(r.sell)+"円"))}
      ${showGp ? td(comp(pct(r.gpRate), gpCls(r.gpRate))) : ""}
      ${td(taxSel(bp+".taxCat",row.taxCat))}${td(inp(bp+".note",row.note,"w-m"))}
      ${td(delBtn("partner."+key,row.id))}</tr>`; }).join("");
  return `<h3>${title}${opts.note ? ` <span class="man">${opts.note}</span>` : ""}</h3><div class="tw"><table class="tbl">
    <tr><th>詳細名</th>${qtyCols.map(([,lab])=>`<th>${lab}</th>`).join("")}
    ${opts.totalInput ? `<th>外貨合計(${esc(S.fx.currency)})</th>` : `<th>外貨単価(${esc(S.fx.currency)})</th><th>外貨小計</th>`}
    <th>円換算原価(自動・万切上げ)</th><th>上乗せ額(円)=粗利</th><th>売価(自動)</th>${showGp ? "<th>粗利率</th>" : ""}<th>課税区分</th><th>備考</th><th></th></tr>
    ${body}</table></div>${addBtn("partner."+key,"行を追加")}`;
}
function secPartner(C){
  const p = activePat().data.partner;
  const c = C.cat.partner, cg = C.cat.guestPartner;
  return `<section class="card" id="sec-partner">${secH(5,"現地提携先費用")}
  <div class="body">
    <div class="grid">
      ${F("現地提携先名", inp("pat.partner.name", p.name))}
      ${F("国", inp("pat.partner.country", p.country))}
      ${F("都市", inp("pat.partner.city", p.city))}
      ${F("備考", inp("pat.partner.note", p.note))}
      ${F("提携先費用 小計(税別売価)", comp(fmt(c.sell + cg.sell)+"円","big"))}
      ${F("うちゲスト/企業訪問(提携先経由)", comp(fmt(cg.sell)+"円"))}
    </div>
    <p class="hint">円換算は共通設定を自動使用:計算レート <strong>${commonRate().toFixed(4)}</strong> / 現地税 <strong>${esc(S.fx.ltType)} ${num(S.fx.ltRate)}%(${S.fx.ltMode==="incl"?"税込":S.fx.ltMode==="excl"?"税別・原価に加算":"未確認"})</strong>。円換算原価は万円単位に切り上げ、<strong>売価 = 円換算原価 + 上乗せ額</strong>(上乗せ額がそのまま粗利)。freee転記では「現地提携先プログラム費」に合算されます。</p>
    ${partnerTable(C,"program","5-1. プログラム費用・会場費",[["qty","数量"],["desc","内容/単位"]],
        { qtyOf: r => num(r.qty), qtyUnit: "" })}
    ${partnerTable(C,"party","5-2. 懇親会",[["people","対象人数(参考)"]],
        { totalInput: true, note: "原価は外貨の合計額で入力" })}
    ${partnerTable(C,"transport","5-3. 交通費・空港送迎",[["desc","内容"],["times","回数"],["vehicles","台数"]],
        { showGp: false, qtyOf: r => num(r.times) * num(r.vehicles), qtyUnit: "回×台" })}
    ${partnerTable(C,"other","5-4. その他現地提携先費用",[["qty","数量"],["desc","内容"]],
        { qtyOf: r => num(r.qty), qtyUnit: "" })}
  </div></section>`;
}

/* --- 6. ゲストスピーカー / 企業訪問 --- */
function secGuest(C){
  const rows = activePat().data.guests;
  const body = rows.map((row,i) => { const bp = `pat.guests.${i}`, r = C.R[row.id];
    return `<tr class="${row.on?"":"off"}">${td(onSw(bp+".on",row.on))}
      ${td(sel(bp+".type",row.type,["ゲストスピーカー","企業訪問","大学訪問","その他"],"w-m"))}
      ${td(inp(bp+".name",row.name,"w-l","会社名/登壇者名"))}
      ${td(inp(bp+".content",row.content,"w-m","内容"))}
      ${td(dinp(bp+".date",row.date))}
      ${td(ninp(bp+".hours",row.hours,"w-s"))}${td(ninp(bp+".days",row.days,"w-s"))}
      ${td(sel(bp+".payVia",row.payVia,[["partner","現地提携先経由"],["direct","直接支払い"]],"w-m"))}
      ${td(ninp(bp+".qty",row.qty,"w-s"))}${td(ninp(bp+".fxUnit",row.fxUnit))}
      ${td(comp(r.fxSub.toLocaleString("ja-JP",{maximumFractionDigits:2})))}
      ${costFormulaCell(r, row.qty, "")}
      ${td(ninp(bp+".markup",row.markup,"w-s"))}
      ${td(comp(fmt(r.sell)+"円"))}
      ${td(comp(pct(r.gpRate), gpCls(r.gpRate)))}
      ${td(taxSel(bp+".taxCat",row.taxCat))}${td(inp(bp+".note",row.note,"w-m"))}
      ${td(delBtn("guests",row.id))}</tr>`; }).join("");
  return `<section class="card" id="sec-guest">${secH(6,"ゲストスピーカー / 企業訪問")}
  <div class="body">
    <p class="hint">円換算は「為替・計算レート」の共通設定(計算レート・現地税)を自動使用します。支払先区分が「現地提携先経由」の行はfreee転記で現地提携先費用に合算、「直接支払い」の行は独立明細になります。</p>
    <div class="tw"><table class="tbl">
      <tr><th></th><th>種別</th><th>会社/登壇者/訪問先</th><th>内容</th><th>実施日</th><th>稼働時間</th><th>稼働日数</th>
      <th>支払先区分</th><th>数量</th><th>外貨単価(${esc(S.fx.currency)})</th><th>外貨小計</th>
      <th>円換算原価(自動・万切上げ)</th><th>上乗せ額(円)=粗利</th><th>売価(自動)</th><th>粗利率</th><th>課税区分</th><th>備考</th><th></th></tr>
      ${body}
    </table></div>${addBtn("guests","ゲスト/訪問先を追加")}
  </div></section>`;
}

/* --- 7. ミッション企業手配 --- */
function secMa(C){
  const m = activePat().data.ma, r = C.R["ma"];
  return `<section class="card" id="sec-ma">${secH(7,"ミッション企業手配費用", onSw("pat.ma.on", m.on))}
  <div class="body"><div class="grid">
    ${F("ミッション企業名", inp("pat.ma.company", m.company))}
    ${F("手配会社名", inp("pat.ma.agency", m.agency))}
    ${F("担当者名", inp("pat.ma.person", m.person))}
    ${F("売価(円)", ninp("pat.ma.sell", m.sell))}
    ${F("原価(手入力)", ninp("pat.ma.cost", m.cost))}
    ${F("粗利", comp(fmt(r.gp)+"円", gpCls(r.gpRate)))}
    ${F("粗利率", comp(pct(r.gpRate), gpCls(r.gpRate)))}
    ${F("課税区分", taxSel("pat.ma.taxCat", m.taxCat))}
    ${F("備考", inp("pat.ma.note", m.note))}
  </div></div></section>`;
}

/* --- 8. バディ --- */
function secBuddy(C){
  const b = activePat().data.buddy, rL = C.R["buddy-local"], rM = C.R["buddy-mtg"];
  return `<section class="card" id="sec-buddy">${secH(8,"バディ手配費用", onSw("pat.buddy.on", b.on))}
  <div class="body">
    <h3>現地稼働</h3>
    <div class="grid">
      ${F("手配会社名", inp("pat.buddy.agency", b.agency))}
      ${F("バディ人数", ninp("pat.buddy.people", b.people))}
      ${F("1人あたり稼働日数", ninp("pat.buddy.daysPer", b.daysPer))}
      ${F("1日あたり稼働時間", ninp("pat.buddy.hoursPerDay", b.hoursPerDay))}
      ${F("総稼働時間(自動)", comp(rL.totalH+" 時間"))}
      ${F("時間単価(円・請求側)", ninp("pat.buddy.unit", b.unit))}
      ${F("売価(自動)", comp(fmt(rL.sell)+"円","big"))}
      ${F("原価 時間単価(円・手入力)", ninp("pat.buddy.costUnit", b.costUnit))}
      ${F("原価(自動:原価単価×総稼働時間)", comp(fmt(rL.cost)+"円"))}
      ${F("粗利", comp(fmt(rL.gp)+"円", gpCls(rL.gpRate)))}
      ${F("粗利率", comp(pct(rL.gpRate), gpCls(rL.gpRate)))}
    </div>
    <h3>渡航前オンラインMTG</h3>
    <p class="hint">回数は<strong>1班あたり</strong>で入力してください。対象班数(現在 ${esc(activePat().data.cg.targetGroups)}班)を自動で掛けます。</p>
    <div class="grid">
      ${F("回数(1班あたり)", ninp("pat.buddy.mtgCnt", b.mtgCnt))}
      ${F("合計回数(自動:×班数)", comp(rM.totalCnt + " 回"))}
      ${F("単価(円/回)", ninp("pat.buddy.mtgUnit", b.mtgUnit))}
      ${F("売価(自動)", comp(fmt(rM.sell)+"円"))}
      ${F("原価 単価(円/回・手入力)", ninp("pat.buddy.mtgCost", b.mtgCost))}
      ${F("原価(自動:単価×合計回数)", comp(fmt(rM.cost)+"円"))}
      ${F("粗利", comp(fmt(rM.gp)+"円", gpCls(rM.gpRate)))}
      ${F("課税区分(共通)", taxSel("pat.buddy.taxCat", b.taxCat))}
      ${F("備考", inp("pat.buddy.note", b.note))}
    </div>
  </div></section>`;
}

/* --- 9. ホテル --- */
function secHotel(C){
  const rows = activePat().data.hotels;
  const body = rows.map((row,i) => { const bp = `pat.hotels.${i}`, r = C.R[row.id];
    return `<tr class="${row.on?"":"off"}">${td(onSw(bp+".on",row.on))}
      ${td(inp(bp+".name",row.name,"w-l","ホテル名") + inp(bp+".city",row.city,"w-m","都市"))}
      ${td(inp(bp+".roomType",row.roomType,"w-s","部屋タイプ"))}
      ${td(comp(fmt(stayCount())+"名"))}${td(comp((tripNights() != null ? tripNights() : "—")+"泊"))}${td(ninp(bp+".rooms",row.rooms,"w-s"))}
      ${td(ninp(bp+".fxUnit",row.fxUnit))}
      ${td(comp(r.fxSub.toLocaleString("ja-JP",{maximumFractionDigits:2})))}
      ${td(`<div class="comp"><strong>${fmt(r.sell)}</strong>円<div class="man">${man(r.sell)} | 1人 ${fmt(r.unitPP)}円 × ${r.hPeople}名 | 原価 ${fmt(r.cost)}円(切上げ前 ${fmt(r.raw)}円)</div></div>`)}
      ${td(sel(bp+".breakfast",row.breakfast,["込み","別","不明"],"w-s"))}
      ${td(sel(bp+".taxSvc",row.taxSvc,["込み","別","不明"],"w-s"))}
      ${td(taxSel(bp+".taxCat",row.taxCat))}${td(inp(bp+".note",row.note,"w-m"))}
      ${td(delBtn("hotels",row.id))}</tr>`; }).join("");
  return `<section class="card" id="sec-hotel">${secH(9,"ホテル費用")}
  <div class="body">
    <p class="hint">宿泊対象人数(${fmt(stayCount())}名)と宿泊数(${tripNights() != null ? tripNights() + "泊" : "日程未入力"})は基本情報から自動反映。外貨小計 = 部屋数 × 宿泊数 × 1泊1室単価。${tripNights() == null ? '<strong style="color:#b3261e">渡航開始日・終了日を入力すると宿泊数が計算されます。</strong>' : ""}</p>
    <div class="tw"><table class="tbl">
      <tr><th></th><th>ホテル名/都市</th><th>部屋タイプ</th><th>宿泊対象人数(自動)</th><th>宿泊数(自動)</th><th>部屋数</th>
      <th>1泊1室 外貨単価(${esc(S.fx.currency)})</th><th>外貨小計</th>
      <th>円換算原価=売価(自動・万切上げ)</th><th>朝食</th><th>税サ</th><th>課税区分</th><th>備考</th><th></th></tr>
      ${body}
    </table></div>${addBtn("hotels","ホテルを追加")}
  </div></section>`;
}

/* --- 10. 航空券 --- */
function secFlight(C){
  const f = activePat().data.flight, r = C.R["flight"];
  return `<section class="card" id="sec-flight">${secH(10,"航空券")}
  <div class="body"><div class="grid">
    ${F("手配区分", sel("pat.flight.arrange", f.arrange,
        ["GE見積に含める","貴社直接手配","旅行会社から貴社へ直接請求","未定"]))}
    ${F("対象人数(自動:参加者+事務局" + (S.basic.lecturerFlight ? "+講師" : "") + ")", comp(fmt(r.people)+" 名"))}
    ${F("1人あたり単価(円)", ninp("pat.flight.unit", f.unit))}
    ${F("合計金額(自動)", comp(fmt(r.sell)+"円","big"))}
    ${F("課税区分", taxSel("pat.flight.taxCat", f.taxCat))}
    ${F("備考", inp("pat.flight.note", f.note))}
  </div>
  <p class="hint">合計金額は単価 × 対象人数で自動計算され、見積合計に含まれます。<strong>見積に含めたくない場合は単価を空欄にしてください</strong>(0円として扱われます)。</p>
  ${C.flightNote ? `<div class="notebox">手配区分が直接手配のため、freee転記サマリーの航空券行に次の注記が表示されます:<br><strong>「${FLIGHT_NOTE}」</strong></div>` : ""}
  </div></section>`;
}

/* --- 11. アテンド --- */
function attendTable(C, key, title){
  const rows = activePat().data[key];
  const body = rows.map((row,i) => { const bp = `pat.${key}.${i}`, r = C.R[row.id];
    return `<tr>${td(ninp(bp+".days",row.days,"w-s"))}${td(ninp(bp+".unit",row.unit))}
      ${td(comp(fmt(r.sell)+"円"))}
      ${td(taxSel(bp+".taxCat",row.taxCat))}${td(inp(bp+".note",row.note,"w-m"))}
      ${td(delBtn(key,row.id))}</tr>`; }).join("");
  return `<h3>${title}</h3><div class="tw"><table class="tbl">
    <tr><th>稼働日数</th><th>1日あたり単価</th><th>売価(自動)</th><th>課税区分</th><th>備考</th><th></th></tr>
    ${body}</table></div>${addBtn(key,"担当者を追加")}`;
}
function secAttend(C){
  return `<section class="card" id="sec-attend">${secH(11,"アテンド費用")}
  <div class="body">
    ${attendTable(C,"al","11-1. 当社現地アテンド費用")}
    ${attendTable(C,"ad","11-2. 当社国内アテンド費用")}
  </div></section>`;
}

/* --- 12. 企画・管理費 --- */
function secMgmt(C){
  const m = activePat().data.mgmt, r = C.R["mgmt"];
  const labels = { pre:"事前研修", consult:"コンサルティング", partner:"現地提携先費用(ゲスト提携先経由含む)",
    guest:"ゲスト/企業訪問(直接支払い)", ma:"ミッション企業手配", buddy:"バディ手配",
    hotel:"ホテル費用", flight:"航空券", al:"現地アテンド", ad:"国内アテンド", others:"その他費用" };
  const boxes = Object.keys(labels).map(k =>
    chk(`pat.mgmt.targets.${k}`, m.targets[k], labels[k])).join(" &nbsp; ");
  return `<section class="card" id="sec-mgmt">${secH(12,"企画・管理費")}
  <div class="body">
    <div class="grid">
      ${F("企画・管理費率(%)", ninp("pat.mgmt.ratePct", m.ratePct))}
      ${F("対象金額合計(税別売価)", comp(fmt(r.base)+"円"))}
      ${F("企画・管理費(自動・全額が粗利)", comp(fmt(r.sell)+"円","big"))}
      ${F("課税区分", taxSel("pat.mgmt.taxCat", m.taxCat))}
      ${F("備考", inp("pat.mgmt.note", m.note))}
    </div>
    <h3>%をかける対象項目</h3>
    <div style="line-height:2.2">${boxes}</div>
  </div></section>`;
}

/* --- 13. その他費用 --- */
function secOthers(C){
  const rows = activePat().data.others;
  const body = rows.map((row,i) => { const bp = `pat.others.${i}`, r = C.R[row.id];
    return `<tr>${td(inp(bp+".name",row.name,"w-l","名目"))}
      ${td(ninp(bp+".sell",row.sell))}${td(ninp(bp+".cost",row.cost))}
      ${gpTds(r)}${td(taxSel(bp+".taxCat",row.taxCat))}
      ${td(inp(bp+".note",row.note,"w-l"))}
      ${td(delBtn("others",row.id))}</tr>`; }).join("");
  return `<section class="card" id="sec-others">${secH(13,"その他費用")}
  <div class="body">
    <div class="tw"><table class="tbl">
      <tr><th>名目</th><th>売価</th><th>原価</th><th>粗利</th><th>粗利率</th><th>課税区分</th><th>備考</th><th></th></tr>
      ${body}
    </table></div>${addBtn("others","その他費用を追加")}
    <div class="notebox">※ 実費費用(翻訳費用など)が請求費用を上回った場合には追加でご請求をいたします。</div>
  </div></section>`;
}

/* --- 14. 課税・粗利サマリー --- */
function secTax(C){
  const t = C.totals;
  const dRows = C.detail.map(({label, r}) =>
    `<tr><td>${esc(label)}</td><td class="r">${fmt(r.sell)}</td><td class="r">${fmt(r.cost)}</td>
      <td class="r ${gpCls(r.gpRate)}">${fmt(r.gp)}</td><td class="r ${gpCls(r.gpRate)}">${pct(r.gpRate)}</td>
      <td class="r">${fmt(r.tax)}</td></tr>`).join("");
  const warns = [];
  if (C.warn.taxUnknown) warns.push(`課税区分が「未確認」の項目が ${C.warn.taxUnknown} 件あります。`);
  if (C.warn.ltUnknown) warns.push(`現地税(GST/VAT)が「未確認」の項目が ${C.warn.ltUnknown} 件あります。税込/税別を提携先に確認してください。`);
  return `<section class="card" id="sec-tax">${secH(14,"課税・粗利サマリー")}
  <div class="body">
    <div class="grid">
      ${F("税別売価合計", comp(fmt(t.ex)+"円 / "+man(t.ex),"big"))}
      ${F("税別原価合計", comp(fmt(t.cost)+"円"))}
      ${F("粗利合計", comp(fmt(t.gp)+"円 / "+man(t.gp), "big "+gpCls(t.gpRate)))}
      ${F("粗利率", comp(pct(t.gpRate), "big "+gpCls(t.gpRate)))}
      ${F("課税対象売上合計", comp(fmt(t.taxableEx)+"円"))}
      ${F("非課税・不課税等売上合計", comp(fmt(t.nonTaxEx)+"円"))}
      ${F("消費税額("+num(S.taxRate)+"%・明細ごと計算)", comp(fmt(t.tax)+"円"))}
      ${F("税込売価合計", comp(fmt(t.inc)+"円 / "+man(t.inc),"big"))}
    </div>
    <p class="hint">粗利率の目安:20%未満は黄色、10%未満は赤で表示されます。</p>
    <div class="tw"><table class="tbl sumtbl">
      <tr><th>項目(内訳)</th><th>売価(税別)</th><th>原価</th><th>粗利</th><th>粗利率</th><th>消費税</th></tr>
      ${dRows}
      <tfoot><tr><td>合計</td><td class="r">${fmt(t.ex)}</td><td class="r">${fmt(t.cost)}</td>
      <td class="r">${fmt(t.gp)}</td><td class="r">${pct(t.gpRate)}</td><td class="r">${fmt(t.tax)}</td></tr></tfoot>
    </table></div>
    ${warns.map(w=>`<div class="alertbox">⚠ ${w}</div>`).join("")}
  </div></section>`;
}

/* --- 14. freee転記用サマリー --- */
function secFreee(C){
  const t = C.totals;
  const rows = C.freee.map(l => l.subtotal
    ? `<tr style="background:#eef3f8;font-weight:700"><td>${esc(l.label)}</td><td></td><td></td><td></td>
       <td class="r">${fmt(l.ex)}</td><td class="r">${fmt(l.tax)}</td><td class="r">${fmt(l.inc)}</td>
       <td class="r man">${man(l.inc)}</td><td></td></tr>`
    : l.excluded
    ? `<tr class="off"><td>${esc(l.label)}</td><td>対象外</td><td class="r">—</td><td class="r">—</td>
       <td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td>${esc(l.note)}</td></tr>`
    : `<tr><td>${esc(l.label)}</td><td>${esc(l.taxCat)}${l.taxCat==="未確認" ? ' <span class="badge warn">要確認</span>' : ""}</td>
     <td class="r">${fmt(l.unit)}</td><td class="r">${l.qty.toLocaleString("ja-JP")} ${esc(l.qtyUnit)}</td>
     <td class="r">${fmt(l.ex)}</td><td class="r">${fmt(l.tax)}</td><td class="r">${fmt(l.inc)}</td>
     <td class="r man">${man(l.inc)}</td><td>${esc(l.note)}</td></tr>`).join("");
  return `<section class="card" id="sec-freee">${secH(15,"freee転記用サマリー")}
  <div class="body">
    <div class="grid">
      ${F("見積書件名", comp(esc(S.basic.project)))}
      ${F("顧客名", comp(esc(S.basic.client||"—")))}
      ${F("パターン", comp(esc(activePat().name)))}
      ${F("税別合計", comp(fmt(t.ex)+"円 / "+man(t.ex),"big"))}
      ${F("消費税", comp(fmt(t.tax)+"円"))}
      ${F("税込合計", comp(fmt(t.inc)+"円 / "+man(t.inc),"big"))}
      ${F("粗利合計", comp(fmt(t.gp)+"円 / "+man(t.gp), gpCls(t.gpRate)))}
      ${F("粗利率", comp(pct(t.gpRate), gpCls(t.gpRate)))}
    </div>
    <h3>freee転記用明細</h3>
    <div class="tw"><table class="tbl sumtbl">
      <tr><th>品目名</th><th>税区分</th><th>単価(円)</th><th>数量</th><th>税別金額(円)</th><th>消費税(円)</th><th>税込金額(円)</th><th>税込(万円)</th><th>備考</th></tr>
      ${rows}
      <tfoot><tr><td>合計</td><td></td><td></td><td></td><td class="r">${fmt(t.ex)}</td><td class="r">${fmt(t.tax)}</td>
      <td class="r">${fmt(t.inc)}</td><td class="r man">${man(t.inc)}</td><td></td></tr></tfoot>
    </table></div>
    ${C.flightNote ? `<div class="notebox">※ 航空券は貴社直接手配、または旅行会社から貴社へ直接請求を想定しており、当社見積には含めておりません。</div>` : ""}
    ${C.warn.ltUnknown ? `<div class="alertbox">⚠ 現地税(GST/VAT)が未確認の項目が ${C.warn.ltUnknown} 件あります。原価が変わる可能性があります。</div>` : ""}
  </div></section>`;
}

/* --- 15. パターン比較 --- */
function secCompare(){
  const cols = S.patterns.map(p => ({ p, c: computeAll(p.data) }));
  const row = (lab, fn, cls="") =>
    `<tr><td>${lab}</td>${cols.map(({p,c}) => `<td class="r ${cls}">${fn(p,c)}</td>`).join("")}</tr>`;
  return `<section class="card" id="sec-compare">${secH(16,"パターン比較一覧")}
  <div class="body">
    <p class="hint">上部のパターンタブから「このパターンを複製」で新パターンを作成できます。案件名・顧客名以外(日程・参加者数・国・費用)はすべてパターンごとに独立しており、複製後の編集は互いに影響しません。</p>
    <div class="tw"><table class="tbl sumtbl">
      <tr><th>項目</th>${cols.map(({p}) => `<th>${esc(p.name||"(無題)")}${p.id===S.active?' <span class="badge ok">表示中</span>':""}</th>`).join("")}</tr>
      ${row("参加者数", p => fmt(num(p.data.basic.participants))+" 名")}
      ${row("期間", p => { const n = tripNightsFor(p.data.basic);
        return n != null ? n + "泊" + (n+1) + "日(" + tripWeeksFor(p.data.basic) + "週間)" : "—"; })}
      ${row("税別合計", (p,c) => fmt(c.totals.ex)+"円")}
      ${row("(万円)", (p,c) => man(c.totals.ex), "man")}
      ${row("税込合計", (p,c) => fmt(c.totals.inc)+"円")}
      ${row("1人あたり税別", (p,c) => fmt(c.totals.ppEx)+"円")}
      ${row("1人あたり税込", (p,c) => fmt(c.totals.ppInc)+"円")}
      ${row("原価合計", (p,c) => fmt(c.totals.cost)+"円")}
      ${row("粗利合計", (p,c) => `<span class="${gpCls(c.totals.gpRate)}">${fmt(c.totals.gp)}円</span>`)}
      ${row("粗利率", (p,c) => `<span class="${gpCls(c.totals.gpRate)}">${pct(c.totals.gpRate)}</span>`)}
      ${row("コメント", p => esc(p.comment||"—"))}
    </table></div>
  </div></section>`;
}

/* =====================================================================
   全体描画
   ===================================================================== */
function render(){
  // フォーカス位置を記憶
  const ae = document.activeElement;
  let focusP = null, selS = null, selE = null;
  if (ae && ae.dataset && ae.dataset.p){
    focusP = ae.dataset.p;
    try { selS = ae.selectionStart; selE = ae.selectionEnd; } catch(e){}
  }
  CUR_FOCUS = focusP;

  const C = computeAll(activePat().data);
  renderCasebar();
  renderPatbar();
  renderSumbar(C);
  document.getElementById("main").innerHTML =
    `<datalist id="curlist">${CURRENCIES.map(c=>`<option value="${c}">`).join("")}</datalist>` +
    secBasic() + secFx() + secPre(C) + secConsult(C) + secPartner(C) + secGuest(C) +
    secMa(C) + secBuddy(C) + secHotel(C) + secFlight(C) + secAttend(C) + secMgmt(C) +
    secOthers(C) + secTax(C) + secFreee(C) + secCompare();

  // フォーカス復元
  if (focusP){
    const el = document.querySelector(`[data-p="${CSS.escape(focusP)}"]`);
    if (el){ el.focus();
      if (selS != null){ try { el.setSelectionRange(selS, selE); } catch(e){} } }
  }
  save();
}

/* =====================================================================
   行テンプレート(追加ボタン用)
   ===================================================================== */
const ROW_TPL = {
  "preRows": () => ({ id:uid(), name:"", lecturer:"", times:"1", hours:"1", days:"1", sell:"", gpIn:"0", matUnit:"0", taxCat:"課税", note:"" }),
  "cm": () => ({ id:uid(), company:"", preCnt:"1", localCnt:"2", postCnt:"0", hoursPer:"1", unit:"50000", costRate:"50", taxCat:"課税", note:"" }),
  "partner.program": () => Object.assign({ id:uid(), name:"", desc:"", qty:"1", fxUnit:"", markup:"0", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "partner.party": () => Object.assign({ id:uid(), name:"", people:String(stayCount()), fxTotal:"", markup:"0", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "partner.transport": () => Object.assign({ id:uid(), name:"", desc:"", times:"1", vehicles:"1", fxUnit:"", markup:"0", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "partner.other": () => Object.assign({ id:uid(), name:"", desc:"", qty:"1", fxUnit:"", markup:"0", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "guests": () => Object.assign({ id:uid(), on:true, type:"ゲストスピーカー", name:"", content:"", date:"", hours:"1", days:"1",
      payVia:"partner", qty:"1", fxUnit:"", markup:"0", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "hotels": () => Object.assign({ id:uid(), on:true, name:"", city:"", roomType:"", people:String(stayCount()), nights:"", rooms:String(stayCount()),
      fxUnit:"", sell:"", breakfast:"不明", taxSvc:"不明", cancel:"", taxCat:"不課税", note:"" }, fxBlock(S.fx.currency)),
  "others": () => ({ id:uid(), name:"", sell:"", cost:"0", taxCat:"課税", note:"" }),
  "al": () => ({ id:uid(), person:"", days:"", unit:"", cost:"", taxCat:"課税", note:"" }),
  "ad": () => ({ id:uid(), person:"", days:"", unit:"", cost:"", taxCat:"課税", note:"" })
};
function tblArray(key){
  const pd = activePat().data;
  if (key.startsWith("partner.")) return pd.partner[key.split(".")[1]];
  if (key === "preRows") return pd.pre.rows;
  return pd[key];
}

/* =====================================================================
   イベント
   ===================================================================== */
let raf = null;
function scheduleRender(){ if (raf) return; raf = requestAnimationFrame(() => { raf = null; render(); }); }

/* 数値欄からフォーカスが外れたらカンマ表示に整形 */
document.addEventListener("focusout", e => {
  const t = e.target;
  if (t && t.dataset && t.dataset.p && t.classList && t.classList.contains("num")) scheduleRender();
});

/* 日本語入力(IME)中は再描画しない。確定時に反映する。 */
let composing = false;
document.addEventListener("compositionstart", () => { composing = true; });
document.addEventListener("compositionend", e => {
  composing = false;
  const p = e.target.dataset && e.target.dataset.p;
  if (p){ setPath(p, e.target.value); scheduleRender(); }
});

/* 日付入力: 矢印連打を邪魔しないよう再描画せず反映。
   渡航開始日を選んだら終了日の初期値に自動コピー。 */
function handleDateInput(p, v){
  setPath(p, v);
  if (p === "pat.basic.startDate" && v){
    const pb = patBasic();
    if (!pb.endDate || pb.endDate < v){
      pb.endDate = v;
      const el = document.querySelector('[data-p="pat.basic.endDate"]');
      if (el) el.value = v;
    }
  }
  save();
}

document.addEventListener("input", e => {
  if (composing || e.isComposing) return;
  const p = e.target.dataset && e.target.dataset.p;
  if (!p) return;
  if (e.target.type === "date"){ handleDateInput(p, e.target.value); return; }
  if (e.target.dataset.t === "bool") setPath(p, e.target.checked);
  else setPath(p, e.target.value);
  scheduleRender();
});
document.addEventListener("change", e => {
  if (e.target.id === "casesel"){ setActiveCase(e.target.value); render(); window.scrollTo({top:0}); return; }
  if (composing || e.isComposing) return;
  const p = e.target.dataset && e.target.dataset.p;
  if (!p) return;
  if (e.target.type === "date"){ handleDateInput(p, e.target.value); return; }
  if (e.target.dataset.t === "bool") setPath(p, e.target.checked);
  else setPath(p, e.target.value);
  scheduleRender();
});

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "addRow"){ tblArray(btn.dataset.tbl).push(ROW_TPL[btn.dataset.tbl]()); render(); }

  else if (act === "delRow"){
    const arr = tblArray(btn.dataset.tbl);
    const i = arr.findIndex(r => r.id === btn.dataset.id);
    if (i >= 0 && confirm("この行を削除しますか?")){ arr.splice(i,1); render(); }
  }

  else if (act === "switchPat"){ S.active = btn.dataset.id; render(); window.scrollTo({top:0}); }

  else if (act === "dupPat"){
    const cur = activePat();
    const copy = { id: uid(), name: cur.name + " (コピー)", comment: "",
      data: JSON.parse(JSON.stringify(cur.data)) };
    // 複製時に行IDを振り直す
    (function reId(o){ if (Array.isArray(o)) o.forEach(reId);
      else if (o && typeof o === "object"){ if (o.id) o.id = uid(); Object.values(o).forEach(reId); } })(copy.data);
    S.patterns.push(copy); S.active = copy.id; render(); window.scrollTo({top:0});
  }

  else if (act === "delPat"){
    if (S.patterns.length <= 1) return;
    if (!confirm(`パターン「${activePat().name}」を削除しますか?`)) return;
    S.patterns = S.patterns.filter(p => p.id !== S.active);
    S.active = S.patterns[0].id; render();
  }

  else if (act === "newCase"){
    const name = prompt("新しい案件名を入力してください", "新規案件");
    if (name === null) return;
    const c = newCase(name); c.basic.client = "";
    ROOT.cases.push(c); setActiveCase(c.id); render(); window.scrollTo({top:0});
  }

  else if (act === "dupCase"){
    const copy = JSON.parse(JSON.stringify(S));
    copy.id = uid(); copy.updatedAt = Date.now();
    copy.basic.project = (copy.basic.project || "案件") + " (コピー)";
    (function reId(o){ if (Array.isArray(o)) o.forEach(reId);
      else if (o && typeof o === "object"){ if (o.id) o.id = uid(); Object.values(o).forEach(reId); } })(copy.patterns);
    copy.active = copy.patterns[0].id;
    ROOT.cases.push(copy); setActiveCase(copy.id); render(); window.scrollTo({top:0});
  }

  else if (act === "delCase"){
    if (ROOT.cases.length <= 1) return;
    if (!confirm(`案件「${S.basic.project}」を削除しますか?\n(必要であれば先にJSONかExcelで書き出してください)`)) return;
    ROOT.cases = ROOT.cases.filter(c => c.id !== S.id);
    setActiveCase(ROOT.cases[0].id); render();
  }

  else if (act === "excel"){ exportExcel(); }

  else if (act === "export"){
    const blob = new Blob([JSON.stringify(S, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date().toISOString().slice(0,10);
    a.download = `GETC見積_${(S.basic.project||"無題").replace(/[\\/:*?"<>|]/g,"_")}_${d}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  else if (act === "import"){ document.getElementById("filein").click(); }

  else if (act === "reset"){
    if (confirm(`表示中の案件「${S.basic.project}」の入力を消してサンプルデータに戻します。よろしいですか?\n(他の案件には影響しません)`)){
      const c = defaultState();
      for (const k of ["basic","fx","taxRate","patterns","active"]) S[k] = c[k];
      render();
    }
  }
});

document.getElementById("filein").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const obj = JSON.parse(rd.result);
      if (!obj.patterns || !obj.basic) throw new Error("形式が違います");
      obj.id = uid(); obj.updatedAt = Date.now();
      ROOT.cases.push(obj); setActiveCase(obj.id); migrate();
      if (!S.patterns.find(p => p.id === S.active)) S.active = S.patterns[0].id;
      render();
      alert("新しい案件として読み込みました。");
    } catch(err){ alert("JSONの読み込みに失敗しました: " + err.message); }
  };
  rd.readAsText(file);
  e.target.value = "";
});

/* ---------- init ---------- */
load();
migrate();
renderNav();
render();

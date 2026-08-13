/* 做题小程序 —— 网页版 H5
 * 数据：window.BANK (由 extract.py 生成)
 * 状态：localStorage (错题库 / 收藏 / 已做进度 / 每章进度)
 */
(function () {
  "use strict";
  const BANK = window.BANK || { chapters: [] };

  // ---------- 存储 ----------
  const KEY = { wrong: "quiz_wrong_v1", fav: "quiz_fav_v1", done: "quiz_done_v1", progress: "quiz_progress_v1" };
  function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  let wrong = load(KEY.wrong, {});   // {qid: ts}
  let fav = load(KEY.fav, {});       // {qid: 1}
  let done = load(KEY.done, {});     // {qid: 'ok'|'wrong'}
  let progress = load(KEY.progress, {}); // {chapterNum: qid} 每章最后做到哪题

  // ---------- 全局题表 ----------
  const QMAP = {};
  let TOTAL = 0;
  BANK.chapters.forEach(function (ch) {
    ch.questions.forEach(function (q) {
      q._ch = ch.num; q._chName = ch.name;
      QMAP[q.id] = q; TOTAL += 1;
    });
  });

  const TYPE_NAME = { single: "单选题", calc: "计算/简答", case: "案例分析" };

  // ---------- DOM 工具 ----------
  const $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function show(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $("#" + id).classList.add("active");
    const fb = $("#footbar");
    if (fb) fb.style.display = (id === "practice") ? "flex" : "none";
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, 1400);
  }

  // ---------- 会话 ----------
  let session = null; // {qids, idx, title, chapter, results:{}}

  function startSession(qids, title, chapter, startIdx) {
    qids = qids.filter(function (id) { return QMAP[id]; });
    if (!qids.length) { toast("没有题目"); return; }
    session = {
      qids: qids,
      idx: Math.max(0, Math.min(startIdx || 0, qids.length - 1)),
      title: title || "练习",
      chapter: (chapter == null ? null : chapter),
      results: {}
    };
    show("practice");
    renderQuestion();
  }

  // 答对自动跳下一题；答错停留
  function jumpNext() {
    setTimeout(function () {
      if (!session) return;
      if (session.idx < session.qids.length - 1) { session.idx++; renderQuestion(); }
      else finishSession();
    }, 550);
  }

  function curQ() { return QMAP[session.qids[session.idx]]; }

  function renderQuestion() {
    const q = curQ();
    // 记录每章进度（仅单章练习时）
    if (session.chapter != null) { progress[session.chapter] = q.id; save(KEY.progress, progress); }
    const wrap = $("#qcard");
    wrap.innerHTML = "";

    const total = session.qids.length;
    const idx = session.idx + 1;

    // 头部
    const head = el("div", "qhead");
    const left = el("div");
    const badge = el("span", "badge " + q.type, TYPE_NAME[q.type] || q.type);
    left.appendChild(badge);
    const t2 = el("div", "sub", "第" + q._ch + "章 · " + q._chName);
    left.appendChild(t2);
    head.appendChild(left);
    const star = el("div", "star" + (fav[q.id] ? " on" : ""), "★");
    star.onclick = function () { toggleFav(q.id, star); };
    head.appendChild(star);
    wrap.appendChild(head);

    $("#ptitle").textContent = session.title;
    $("#pcount").textContent = idx + " / " + total;
    const pbar = $("#pbar"); if (pbar && pbar.firstElementChild) pbar.firstElementChild.style.width = (idx / total * 100) + "%";

    // 题干
    const stem = el("div", "stem", q.stem && q.stem.trim() ? q.stem : "（题干提取不全，请对照原书）");
    wrap.appendChild(stem);

    const answered = session.results[q.id];

    if (q.type === "single") {
      wrap.appendChild(renderSingle(q, answered));
    } else {
      wrap.appendChild(renderReveal(q, answered));
    }

    // 底部按钮
    $("#prevBtn").disabled = session.idx === 0;
    $("#nextBtn").textContent = (session.idx === total - 1) ? "完成" : "下一题";
  }

  // 单选题
  function renderSingle(q, answered) {
    const box = el("div", "opts");
    const opts = q.options || [];
    const state = { locked: !!answered };
    opts.forEach(function (o) {
      const row = el("div", "opt");
      row.appendChild(el("div", "k", o.key));
      row.appendChild(el("div", "v", o.text));
      if (answered) {
        if (o.key === q.answer) row.classList.add("correct");
        else if (o.key === answered && answered !== q.answer) row.classList.add("wrong");
        else row.classList.add("dim");
      }
      row.onclick = function () {
        if (state.locked) return;
        state.locked = true;
        const correct = o.key === q.answer;
        opts.forEach(function (p) {
          const r = box.children[opts.indexOf(p)];
          if (p.key === q.answer) r.classList.add("correct");
          else if (p.key === o.key && !correct) r.classList.add("wrong");
          else r.classList.add("dim");
        });
        session.results[q.id] = o.key;
        recordResult(q, correct ? "ok" : "wrong");
        if (correct) { removeWrong(q.id); toast("回答正确 ✓"); jumpNext(); }
        else { addWrong(q.id); toast("回答错误 ✗"); }
        if (q.analysis) box.appendChild(buildAnalysis(q.analysis));
      };
      box.appendChild(row);
    });
    if (answered && q.analysis) box.appendChild(buildAnalysis(q.analysis));
    return box;
  }

  // 计算 / 案例（显示答案）
  function renderReveal(q, answered) {
    const box = el("div");
    if (answered) {
      box.appendChild(buildAnswer(q.answer, q.type));
      if (q.analysis) box.appendChild(buildAnalysis(q.analysis));
      box.appendChild(buildJudge(q, answered));
    } else {
      const btn = el("button", "btn primary", "显示答案");
      btn.style.marginTop = "6px";
      btn.onclick = function () {
        if (session.results[q.id] !== "ok" && session.results[q.id] !== "wrong") {
          session.results[q.id] = "shown";
        }
        renderQuestion();
      };
      box.appendChild(btn);
    }
    return box;
  }

  function buildAnswer(ans, type) {
    const a = el("div", "answerbox");
    a.appendChild(el("div", "muted", "参考答案："));
    a.appendChild(el("div", null, (ans && ans.trim()) ? ans : "（原书未提供参考答案）"));
    return a;
  }
  function buildAnalysis(txt) {
    const d = el("div", "analysis");
    d.appendChild(el("div", "muted", "解析："));
    d.appendChild(el("div", null, txt));
    return d;
  }
  function buildJudge(q, answered) {
    const row = el("div", "row");
    row.style.marginTop = "12px";
    if (answered === "ok") {
      row.appendChild(el("div", "muted", "已标记为：答对 ✓"));
    } else if (answered === "wrong") {
      row.appendChild(el("div", "muted", "已标记为：答错 ✗（已入错题库）"));
    } else {
      const ok = el("button", "btn", "我答对了 ✓");
      ok.onclick = function () { recordResult(q, "ok"); removeWrong(q.id); session.results[q.id] = "ok"; renderQuestion(); toast("已记录 ✓"); jumpNext(); };
      const no = el("button", "btn ghost", "我答错了 ✗");
      no.onclick = function () { recordResult(q, "wrong"); addWrong(q.id); session.results[q.id] = "wrong"; renderQuestion(); toast("已入错题库"); };
      row.appendChild(ok); row.appendChild(no);
    }
    return row;
  }

  // ---------- 记录 ----------
  function recordResult(q, res) { done[q.id] = res; save(KEY.done, done); }
  function addWrong(id) { wrong[id] = Date.now(); save(KEY.wrong, wrong); }
  function removeWrong(id) { if (wrong[id]) { delete wrong[id]; save(KEY.wrong, wrong); } }
  function toggleFav(id, star) {
    if (fav[id]) { delete fav[id]; star.classList.remove("on"); toast("已取消收藏"); }
    else { fav[id] = 1; star.classList.add("on"); toast("已收藏 ★"); }
    save(KEY.fav, fav); refreshStats();
  }

  // ---------- 导航 ----------
  $("#nextBtn").onclick = function () {
    if (!session) return;
    if (session.idx < session.qids.length - 1) { session.idx++; renderQuestion(); }
    else finishSession();
  };
  $("#prevBtn").onclick = function () { if (session && session.idx > 0) { session.idx--; renderQuestion(); } };
  $("#exitBtn").onclick = function () { session = null; renderHome(); show("home"); };

  function finishSession() {
    let ok = 0, wrongN = 0, other = 0;
    session.qids.forEach(function (id) {
      const r = done[id];
      if (r === "ok") ok++; else if (r === "wrong") wrongN++; else other++;
    });
    // 单章完成后清除该章进度（下次从头）
    if (session.chapter != null && progress[session.chapter] != null) { delete progress[session.chapter]; save(KEY.progress, progress); }
    const wrap = $("#qcard"); wrap.innerHTML = "";
    const s = el("div", "summary");
    s.appendChild(el("div", "muted", session.title + " · 完成"));
    s.appendChild(el("div", "big", ok + " / " + session.qids.length));
    s.appendChild(el("div", "sub", "答对 " + ok + " · 答错 " + wrongN + " · 未判定 " + other));
    const row = el("div", "row"); row.style.justifyContent = "center"; row.style.marginTop = "16px";
    const again = el("button", "btn primary", "再来一次");
    again.onclick = function () { startSession(session.qids, session.title, session.chapter, 0); };
    const back = el("button", "btn ghost", "返回首页");
    back.onclick = function () { session = null; renderHome(); show("home"); };
    row.appendChild(again); row.appendChild(back);
    s.appendChild(row);
    $("#ptitle").textContent = "练习完成";
    $("#pcount").textContent = "";
    const pbar = $("#pbar"); if (pbar && pbar.firstElementChild) pbar.firstElementChild.style.width = "100%";
    wrap.appendChild(s);
    $("#prevBtn").disabled = true; $("#nextBtn").textContent = "完成";
  }

  // ---------- 首页 ----------
  function refreshStats() {
    const doneN = Object.keys(done).length;
    const wrongN = Object.keys(wrong).length;
    const favN = Object.keys(fav).length;
    $("#stTotal").textContent = TOTAL;
    $("#stDone").textContent = doneN;
    $("#stWrong").textContent = wrongN;
    $("#stFav").textContent = favN;
  }

  function renderHome() {
    refreshStats();
    const grid = $("#chapterGrid"); grid.innerHTML = "";
    BANK.chapters.forEach(function (ch) {
      const c = el("div", "ch");
      c.appendChild(el("div", "num", "第 " + ch.num + " 章"));
      c.appendChild(el("div", "name", ch.name));
      const meta = el("div", "meta");
      meta.appendChild(el("span", null, ch.count + " 题"));
      const wn = ch.questions.filter(function (q) { return wrong[q.id]; }).length;
      if (wn) meta.appendChild(el("span", "tag warn", "错 " + wn));
      const dn = ch.questions.filter(function (q) { return done[q.id]; }).length;
      if (dn) meta.appendChild(el("span", "tag", "已做 " + dn));
      else meta.appendChild(el("span", "tag", "未做"));
      if (progress[ch.num] != null) meta.appendChild(el("span", "tag", "▶ 有进度"));
      c.appendChild(meta);
      c.onclick = function () { openChapter(ch); };
      grid.appendChild(c);
    });
  }

  // ---------- 章节详情 ----------
  function openChapter(ch) {
    $("#chTitle").textContent = "第 " + ch.num + " 章 · " + ch.name;
    const ids = ch.questions.map(function (q) { return q.id; });
    const wrongIds = ids.filter(function (id) { return wrong[id]; });
    const favIds = ids.filter(function (id) { return fav[id]; });
    $("#chInfo").textContent = "共 " + ids.length + " 题" + (wrongIds.length ? " · 错题 " + wrongIds.length : "") + (favIds.length ? " · 收藏 " + favIds.length : "");
    const box = $("#chBtns"); box.innerHTML = "";
    // 继续上次
    const lastQid = progress[ch.num];
    if (lastQid && ids.indexOf(lastQid) >= 0) {
      const li = ids.indexOf(lastQid);
      box.appendChild(mkBtn("继续上次（第 " + (li + 1) + " 题）", "primary", function () { startSession(ids, "第" + ch.num + "章 · 继续", ch.num, li); }));
    }
    box.appendChild(mkBtn("顺序练习", "primary", function () { startSession(ids, "第" + ch.num + "章 · 顺序", ch.num, 0); }));
    box.appendChild(mkBtn("随机练习", "", function () { startSession(shuffle(ids.slice()), "第" + ch.num + "章 · 随机", null, 0); }));
    if (wrongIds.length) box.appendChild(mkBtn("错题重练 (" + wrongIds.length + ")", "ghost", function () { startSession(wrongIds, "第" + ch.num + "章 · 错题", null, 0); }));
    if (favIds.length) box.appendChild(mkBtn("收藏练习 (" + favIds.length + ")", "ghost", function () { startSession(favIds, "第" + ch.num + "章 · 收藏", null, 0); }));
    // 清空本章记录
    box.appendChild(mkBtn("清空本章记录并重新做题", "danger", function () { clearChapter(ch.num); }));
    $("#chBack").onclick = function () { renderHome(); show("home"); };
    show("chapter");
  }
  function mkBtn(t, cls, fn) { const b = el("button", "btn " + cls, t); b.style.marginTop = "8px"; b.style.width = "100%"; b.onclick = fn; return b; }

  // 清空某章：进度 + 已做 + 错题（收藏保留）
  function clearChapter(num) {
    if (!window.confirm("确定清空第 " + num + " 章的做题进度、已做与错题记录吗？\n（收藏保留，此操作不可撤销）")) return;
    [KEY.done, KEY.wrong].forEach(function (k) {
      const store = (k === KEY.done) ? done : wrong;
      Object.keys(store).forEach(function (qid) { if (QMAP[qid] && QMAP[qid]._ch === num) delete store[qid]; });
      save(k, store);
    });
    if (progress[num] != null) { delete progress[num]; save(KEY.progress, progress); }
    toast("第 " + num + " 章记录已清空");
    renderHome();
    const ch = BANK.chapters.find(function (c) { return c.num === num; });
    if (ch) openChapter(ch);
  }

  // ---------- 列表（错题库 / 收藏夹）----------
  function openList(mode) { // mode: 'wrong' | 'fav'
    $("#listTitle").textContent = mode === "wrong" ? "错题库" : "收藏夹";
    const ids = (mode === "wrong" ? Object.keys(wrong) : Object.keys(fav));
    const box = $("#listItems"); box.innerHTML = "";
    if (!ids.length) { box.appendChild(el("div", "empty", mode === "wrong" ? "还没有错题，继续加油！" : "还没有收藏任何题目")); }
    ids.forEach(function (id) {
      const q = QMAP[id]; if (!q) return;
      const it = el("div", "listitem");
      const t = el("div", "t", (q.stem || "").replace(/\s+/g, " ").slice(0, 40) || "(题干缺失)");
      const c = el("div", "c", "第" + q._ch + "章");
      it.appendChild(t); it.appendChild(c);
      it.onclick = function () { startSession([id], (mode === "wrong" ? "错题库" : "收藏夹") + " · 单题", null, 0); };
      box.appendChild(it);
    });
    const startBtn = $("#listStart");
    if (ids.length) { startBtn.style.display = ""; startBtn.textContent = "开始练习 (" + ids.length + ")"; startBtn.onclick = function () { startSession(ids, mode === "wrong" ? "错题库练习" : "收藏夹练习", null, 0); }; }
    else startBtn.style.display = "none";
    $("#listBack").onclick = function () { renderHome(); show("home"); };
    show("list");
  }

  // ---------- 全局按钮 ----------
  $("#allSeq").onclick = function () { startSession(BANK.chapters.flatMap(function (c) { return c.questions.map(function (q) { return q.id; }); }), "全部 · 顺序", null, 0); };
  $("#allRand").onclick = function () { startSession(shuffle(BANK.chapters.flatMap(function (c) { return c.questions.map(function (q) { return q.id; }); })), "全部 · 随机", null, 0); };
  $("#openWrong").onclick = function () { openList("wrong"); };
  $("#openFav").onclick = function () { openList("fav"); };

  // ---------- 工具 ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- 启动 ----------
  renderHome();
  show("home");
})();

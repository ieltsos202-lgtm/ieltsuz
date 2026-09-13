/* IELTSUZ mock-test bridge.
   Loaded by every Listening/Reading HTML test. Detects when the test grades
   itself, collects per-question results (user answer, correct answer, status),
   measures time spent, and reports everything to the parent IELTSUZ page via
   postMessage so the platform can analyse the attempt automatically. */
(function () {
  if (window.__ieltsuzBridge) return;
  window.__ieltsuzBridge = true;

  var startedAt = Date.now();
  var sent = false;
  var DEFAULT_TOTAL = 40;

  /* Timer restarts when the learner actually presses "Start" on an intro overlay */
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target && e.target.closest && e.target.closest("#start-test-btn,#startTestBtn,.start-btn,.intro-start-btn,.start-test-button,#startBtn");
      if (t) startedAt = Date.now();
    },
    true
  );

  /* ---------- helpers ---------- */
  function norm(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }
  function normKey(s) {
    return norm(s)
      .toLowerCase()
      .replace(/[.,;:!?'"\u2019\u201c\u201d]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  var SYN = { "true": ["t", "yes", "y"], "false": ["f", "no", "n"], "not given": ["ng", "notgiven", "not-given"] };
  function expand(ans) {
    var arr = Array.isArray(ans) ? ans : String(ans == null ? "" : ans).split(/\s*[\/|]\s*/);
    var out = [];
    arr.forEach(function (a) {
      a = norm(a);
      if (!a) return;
      out.push(normKey(a));
      var noParen = a.replace(/\([^)]*\)/g, "").trim();
      if (noParen !== a) {
        out.push(normKey(noParen));
        out.push(normKey(a.replace(/[()]/g, "")));
      }
    });
    out.slice().forEach(function (o) {
      if (SYN[o]) out = out.concat(SYN[o]);
    });
    return out;
  }
  function isMatch(user, key) {
    var u = normKey(user);
    if (!u) return false;
    return expand(key).indexOf(u) >= 0;
  }
  function notAnswered(s) {
    return !s || /^(not answered|no answer|n\/a|none|blank|\(blank\)|empty|[-\u2013\u2014]+)$/i.test(norm(s));
  }

  /* ---------- answer key discovery ---------- */
  function findKey() {
    var names = ["correctAnswers", "CORRECT_ANSWERS", "answerKey", "ANSWER_KEY", "answerMap", "_answerMap", "questionMeta", "ANSWERS", "answers", "solutions", "key", "KEY"];
    for (var i = 0; i < names.length; i++) {
      try {
        var v = (0, eval)("typeof " + names[i] + ' !== "undefined" ? ' + names[i] + " : undefined");
        if (v && typeof v === "object") {
          var n = Array.isArray(v) ? v.length : Object.keys(v).length;
          if (n >= 10) return v;
        }
      } catch (e) {}
    }
    return null;
  }
  function keyMap() {
    var k = findKey();
    if (!k) return null;
    var m = {};
    var pick = function (v) {
      if (v && typeof v === "object" && !Array.isArray(v)) return v.answer != null ? v.answer : v.correct != null ? v.correct : v.key;
      return v;
    };
    if (Array.isArray(k)) {
      k.forEach(function (v, i) {
        var q = v && typeof v === "object" && !Array.isArray(v) ? v.question || v.q || v.number || v.id || i + 1 : i + 1;
        m[parseInt(q, 10)] = pick(v);
      });
    } else {
      Object.keys(k).forEach(function (q) {
        var qn = parseInt(String(q).replace(/\D/g, ""), 10);
        if (qn) m[qn] = pick(k[q]);
      });
    }
    return m;
  }

  /* ---------- user answer discovery (DOM) ---------- */
  function globalUserAnswer(n) {
    var exprs = [
      "(typeof S!=='undefined'&&S.answers)?S.answers[" + n + "]:undefined",
      "(typeof userAnswers!=='undefined')?(userAnswers[" + n + "]||userAnswers['q' + " + n + "]):undefined",
      "(typeof state!=='undefined'&&state.answers)?state.answers[" + n + "]:undefined",
    ];
    for (var i = 0; i < exprs.length; i++) {
      try {
        var v = (0, eval)(exprs[i]);
        if (v !== undefined && v !== null && v !== "") return Array.isArray(v) ? v.join(" / ") : String(v);
      } catch (e) {}
    }
    return null;
  }
  function chkGlobal(n) {
    try {
      var f = (0, eval)("typeof chk==='function'?chk:(typeof checkQuestion==='function'?checkQuestion:undefined)");
      if (typeof f === "function") return !!f(n);
    } catch (e) {}
    return null;
  }
  function userAnswer(n) {
    var checked = document.querySelector(
      'input[type=radio][name="q' + n + '"]:checked,input[type=checkbox][name="q' + n + '"]:checked,' +
        'input[type=radio][name="' + n + '"]:checked,input[type=radio][data-q="' + n + '"]:checked,' +
        'input[type=radio][name="question' + n + '"]:checked,input[type=radio][name="question-' + n + '"]:checked'
    );
    if (checked) return checked.value || norm(checked.closest("label") && checked.closest("label").textContent);

    var el =
      document.getElementById("q" + n) ||
      document.querySelector(
        '[name="q' + n + '"]:not([type=radio]):not([type=checkbox]),[data-q="' + n + '"]:not([type=radio]),' +
          '[data-question="' + n + '"],#answer' + n + ",#q-" + n + ',[name="question' + n + '"],#ans' + n
      );
    if (el) {
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return el.value;
      var di = el.querySelector && el.querySelector(".drag-item,.ldm-option,[data-value]");
      if (di) return di.dataset.value || di.dataset.letter || norm(di.textContent);
      return el.dataset.value || el.dataset.answer || norm(el.textContent);
    }
    var dz = document.querySelector('.drop-zone[data-q-start="' + n + '"],.drop-zone[data-q="' + n + '"],.ldm-slot[data-q="' + n + '"],[data-slot="' + n + '"]');
    if (dz) {
      var it = dz.querySelector(".drag-item,.ldm-option,[data-value]");
      return it ? it.dataset.value || it.dataset.letter || norm(it.textContent) : dz.dataset.value || "";
    }
    return globalUserAnswer(n);
  }

  /* ---------- result collection ---------- */
  function fromResultTable() {
    var rows = [];
    var det = document.getElementById("result-details");
    if (det) {
      det.querySelectorAll("tr").forEach(function (tr) {
        var td = tr.querySelectorAll("td");
        if (td.length < 3) return;
        var qn = parseInt(norm(td[0].textContent), 10);
        if (!qn) return;
        var ua = norm(td[1].textContent), ca = norm(td[2].textContent), ok;
        if (td[3]) {
          var cls = (td[3].className + " " + tr.className).toLowerCase();
          var txt = norm(td[3].textContent).toLowerCase();
          ok = (/result-correct|(^|\s)correct(\s|$)/.test(cls) && !/incorrect/.test(cls)) || /^(\u2713|\u2714|correct|right)/.test(txt);
          if (/incorrect|wrong|\u2717|\u2718|\u00d7/.test(txt) || /incorrect|wrong/.test(cls)) ok = false;
        } else ok = isMatch(ua, ca);
        rows.push({ q: qn, user: ua, correct: ca, ok: !!ok });
      });
    }
    if (rows.length < 10) {
      var det2 = document.getElementById("results-details") || document.querySelector(".results-details-container");
      if (det2) {
        var r2 = [];
        det2.querySelectorAll(".result-row").forEach(function (r) {
          var qn = parseInt(norm((r.querySelector(".q-num") || {}).textContent), 10);
          if (!qn) return;
          var ua = norm((r.querySelector(".user-ans") || {}).textContent);
          var ca = norm((r.querySelector(".correct-ans") || {}).textContent);
          var ok = r.classList.contains("correct") || (!r.classList.contains("incorrect") && !r.classList.contains("wrong"));
          r2.push({ q: qn, user: ua, correct: ca, ok: ok });
        });
        if (r2.length > rows.length) rows = r2;
      }
    }
    return rows;
  }
  function fromKey() {
    var km = keyMap();
    if (!km) return [];
    var rows = [];
    Object.keys(km)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .forEach(function (q) {
        var ua = userAnswer(q);
        ua = ua === null ? "" : norm(ua);
        var ca = km[q];
        var caText = Array.isArray(ca) ? ca.join(" / ") : String(ca == null ? "" : ca);
        var ok = chkGlobal(q);
        if (ok === null) ok = isMatch(ua, ca);
        rows.push({ q: q, user: ua, correct: caText, ok: ok });
      });
    return rows;
  }
  /* Minified family exposes window._checkResults {qN: bool} and window._answerMap {qN: text} */
  function fromCheckResults() {
    var cr = window._checkResults;
    if (!cr || typeof cr !== "object") return [];
    var am = window._answerMap || {};
    var rows = [];
    Object.keys(cr).forEach(function (k) {
      var qn = parseInt(String(k).replace(/\D/g, ""), 10);
      if (!qn) return;
      var v = cr[k];
      var ok = typeof v === "object" && v !== null ? !!(v.correct || v.ok || v.isCorrect) : !!v;
      var ua = userAnswer(qn);
      var ca = am[k] != null ? am[k] : am[qn];
      rows.push({ q: qn, user: ua === null ? "" : norm(ua), correct: Array.isArray(ca) ? ca.join(" / ") : norm(ca), ok: ok });
    });
    return rows;
  }
  function collect() {
    var rows = fromResultTable();
    if (rows.length < 10) {
      var c = fromCheckResults();
      if (c.length > rows.length) rows = c;
    }
    if (rows.length < 10) {
      var k = fromKey();
      if (k.length > rows.length) rows = k;
    }
    var seen = {};
    return rows.filter(function (r) {
      if (seen[r.q]) return false;
      seen[r.q] = 1;
      return true;
    });
  }
  function displayedScore() {
    var el =
      document.getElementById("results-score") ||
      document.getElementById("score-summary") ||
      document.querySelector(".score-display,.final-score,#score,#finalScore,#scoreText,.results-summary");
    if (!el) return null;
    var t = norm(el.textContent);
    var m = t.match(/(\d+)\s*(?:\/|out of|of)\s*(\d+)/i);
    if (m) return { score: parseInt(m[1], 10), total: parseInt(m[2], 10) };
    m = t.match(/(\d+)/);
    if (m && el.id === "results-score") return { score: parseInt(m[1], 10), total: null };
    return null;
  }

  function report() {
    if (sent) return true;
    var rows = collect();
    var disp = displayedScore();
    if (rows.length < 10 && !disp) return false;

    var score = 0, wrong = [], unanswered = [];
    rows.forEach(function (r) {
      if (r.ok) score++;
      else {
        var blank = notAnswered(r.user);
        if (blank) unanswered.push(r.q);
        wrong.push({ question_number: r.q, user_answer: blank ? "No Answer" : r.user, correct_answer: r.correct });
      }
    });
    var total = rows.length >= 38 ? rows.length : DEFAULT_TOTAL;
    if (disp) {
      if (disp.total) total = disp.total;
      if (!isNaN(disp.score) && disp.score <= total) score = disp.score;
    }
    sent = true;
    var payload = {
      score: score,
      total: total,
      wrong_answers: wrong,
      unanswered: unanswered,
      time_spent_sec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      test_title: document.title,
      answers: rows.map(function (r) { return { q: r.q, user: r.user, correct: r.correct, ok: r.ok }; }),
    };
    try {
      window.parent.postMessage({ type: "IELTS_TEST_COMPLETE", payload: payload }, "*");
    } catch (e) {}
    showBadge();
    return true;
  }

  /* ---------- detection ---------- */
  var FN_NAMES = [
    "checkAnswers",
    "checkAllAnswers",
    "submitTest",
    "submitAnswers",
    "showResults",
    "showResultsModal",
    "openResultModal",
    "showFeedback",
    "confirmSubmitModal",
    "buildResults",
    "deliverTest",
    "finishTest",
    "gradeTest",
    "calculateScore",
  ];
  function wrapGraders() {
    FN_NAMES.forEach(function (name) {
      var orig = window[name];
      if (typeof orig === "function" && !orig.__uz) {
        var w = function () {
          var r = orig.apply(this, arguments);
          setTimeout(report, 80);
          setTimeout(report, 600);
          return r;
        };
        w.__uz = 1;
        try { window[name] = w; } catch (e) {}
      }
    });
  }
  // Some tests declare their grading functions inside DOMContentLoaded / late scripts.
  wrapGraders();
  document.addEventListener("DOMContentLoaded", wrapGraders);
  window.addEventListener("load", wrapGraders);
  setTimeout(wrapGraders, 1500);

  function modalVisible() {
    var sel =
      "#result-modal,#results-modal,.results-modal,#resultModal,#resultsModal,.result-modal," +
      "#resultModalOverlay,#screen-results,#completion-screen,.completion-screen,.results-overlay," +
      "#feedback-panel,#feedbackPanel,.feedback-panel";
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.classList.contains("hidden")) continue;
      var cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      if (el.offsetParent !== null || cs.position === "fixed") return true;
    }
    return false;
  }
  function graded() {
    if (window._checkResults && typeof window._checkResults === "object") return true;
    if (modalVisible()) return true;
    return document.querySelectorAll(".correct,.incorrect,.correct-answer-highlight,.result-correct,.result-incorrect").length >= 5;
  }
  var debounce = null;
  var mo = new MutationObserver(function () {
    if (sent) { mo.disconnect(); return; }
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      if (graded()) report();
    }, 150);
  });
  function startObserving() {
    if (!document.body) return;
    mo.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["style", "class"] });
  }
  if (document.body) startObserving();
  else document.addEventListener("DOMContentLoaded", startObserving);

  /* ---------- parent commands ---------- */
  function forceSubmit() {
    var btn =
      document.querySelector("#deliver-btn,#deliverButton,#deliver-button,#submit-btn,#submitBtn,#submit-button,.deliver-btn,.submit-btn,.deliver-button,.submit-button") ||
      document.querySelector(
        'button[onclick*="checkAnswers"],button[onclick*="checkAllAnswers"],button[onclick*="submitTest"],' +
          'button[onclick*="showResults"],button[onclick*="showFeedback"],a[onclick*="checkAnswers"]'
      );
    if (!btn) {
      var all = document.querySelectorAll("button,a.btn,.btn,input[type=button],input[type=submit]");
      var ok = /^(submit|deliver|finish)([\s\-]?(answers?|test|now))?$|^(check|show|view|see)\s+(answers?|results?|score)$|^my results?$/i;
      for (var i = 0; i < all.length; i++) {
        var label = norm(all[i].textContent || all[i].value);
        if (ok.test(label)) { btn = all[i]; break; }
      }
    }
    if (btn) { try { btn.click(); } catch (e) {} }
    else {
      for (var j = 0; j < FN_NAMES.length; j++) {
        if (typeof window[FN_NAMES[j]] === "function") { try { window[FN_NAMES[j]](); } catch (e) {} break; }
      }
    }
    setTimeout(report, 300);
    setTimeout(report, 1200);
  }
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "IELTS_FORCE_SUBMIT") forceSubmit();
    if (d.type === "IELTS_PING") {
      try { window.parent.postMessage({ type: "IELTS_PONG", startedAt: startedAt }, "*"); } catch (err) {}
    }
  });

  /* ---------- small badge after grading ---------- */
  function showBadge() {
    var b = document.getElementById("ieltsuz-graded-badge");
    if (!b) {
      b = document.createElement("div");
      b.id = "ieltsuz-graded-badge";
      b.textContent = "Natija IELTSUZ tahliliga yuborildi \u2713";
      b.onclick = function () {
        try { window.parent.postMessage({ type: "IELTS_SHOW_FEEDBACK" }, "*"); } catch (e) {}
      };
      document.body.appendChild(b);
    }
    b.classList.add("show");
  }

  try { window.parent.postMessage({ type: "IELTS_BRIDGE_READY" }, "*"); } catch (e) {}
})();

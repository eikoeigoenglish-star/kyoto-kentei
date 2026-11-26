// 2026年度模試。既存モードとは別の保存領域を使い、採点・結果画面は共有する。
const MOCK_MODE = "mock-2026";
const MOCK_KEY = "kk2-mock-2026-progress-v1";
const MOCK_ROUNDS = [1, 2, 3, 4, 5];
const mockState = { ready: false, sets: [], questions: [], progress: {}, ids: new Set() };

async function initMocks() {
  const panel = document.getElementById("mode-mock-2026");
  try {
    const sets = await Promise.all(MOCK_ROUNDS.map(async round => {
      const res = await fetch(`data/mock-2026-${String(round).padStart(2, "0")}.json`);
      if (!res.ok) throw new Error(`第${round}回 HTTP ${res.status}`);
      const data = await res.json();
      if (data.meta?.mock !== round || data.meta?.grade !== 2 || data.meta?.year !== 2026 || data.questions?.length !== 100 ||
          data.questions.some((q, i) => q.id !== `mock-2026-${String(round).padStart(2,"0")}-${String(i+1).padStart(3,"0")}` || q.mock !== round || q.questionNumber !== i+1 || !Array.isArray(q.choices) || new Set(q.choices).size !== 4 || q.choices.length !== 4 || !q.choices.includes(q.correct))) {
        throw new Error(`第${round}回のデータ形式が不正です`);
      }
      return data;
    }));
    mockState.sets = sets;
    mockState.questions = sets.flatMap(set => set.questions.map(q => ({ ...q, __mockId: MOCK_MODE })));
    mockState.ids = new Set(mockState.questions.map(q => q.id));
    let storageError = false;
    try {
      const saved = JSON.parse(localStorage.getItem(MOCK_KEY) || "{}");
      mockState.progress = Object.fromEntries(Object.entries(saved || {}).filter(([id, v]) => mockState.ids.has(id) && Number.isInteger(v) && v >= 0 && v <= MAX_STREAK));
    } catch (_) { storageError = true; }
    renderMockPanel();
    if (storageError) mockStorageWarning();
    mockState.ready = true;
    updateMockPanel();
  } catch (error) {
    console.error("模試の読み込みに失敗", error);
    panel.textContent = "模試データを読み込めませんでした。ページを再読み込みしてください。過去問・公開テーマは引き続き利用できます。";
    mockState.ready = false;
    document.getElementById("mock-load-warning").hidden = false;
  }
}
function mockStorageWarning() {
  const note = document.getElementById("mock-storage-warning");
  if (note) note.hidden = false;
}
function saveMockProgress() {
  try { localStorage.setItem(MOCK_KEY, JSON.stringify(mockState.progress)); }
  catch (_) { mockStorageWarning(); }
}
function stageOfMockQuestion(q) {
  const n = mockState.progress[q.id];
  return n === undefined ? "new" : n >= MAX_STREAK ? "triple" : n === 2 ? "double" : n === 1 ? "hit" : "miss";
}
function mockQuestionLabel(q) {
  return `2026年度模試 第${q.mock}回　第${q.questionNumber}問`;
}
function applyMockResult(q, isCorrect) {
  if (!mockState.ids.has(q.id)) throw new Error("模試IDが不正です");
  const before = stageOfMockQuestion(q);
  mockState.progress[q.id] = isCorrect ? Math.min((mockState.progress[q.id] ?? 0) + 1, MAX_STREAK) : 0;
  return { before, after: stageOfMockQuestion(q) };
}
function finishMockSession() { saveMockProgress(); updateMockPanel(); }
function mockCounts(questions) {
  const counts = Object.fromEntries(STAGES.map(s => [s.key, 0]));
  for (const q of questions) counts[stageOfMockQuestion(q)]++;
  return counts;
}
function mockChip(name, value, label, checked = true, type = "checkbox") {
  const id = `mock-${name}-${value}`;
  return `<input type="${type}" id="${id}" name="mock-${name}" value="${value}" ${checked ? "checked" : ""}><label class="chip" for="${id}">${label}</label>`;
}
function renderMockPanel() {
  const panel = document.getElementById("mode-mock-2026");
  const rangeLabels = ["歴史・史跡", "神社・寺院", "建築・庭園・美術", "伝統文化・芸能", "祭礼・行事", "生活文化", "地理・観光・時事", "豊臣家と京都", "特集①", "特集②"];
  panel.innerHTML = `
    <section class="panel mock-panel">
      <h2 class="panel-title">2026年度模試</h2>
      <p class="panel-desc">全5回・各100問。過去問ではない非公式の独自問題です。正答・解説・進捗は既存モードと独立しています。</p>
      <div class="panel-head"><h3 class="panel-title">進捗</h3><p id="mock-headline" class="mastery-headline"></p><button type="button" class="btn-ghost btn-small" id="mock-reset-all">模試の進捗を消す</button></div>
      <div class="mastery-bar" id="mock-bar" role="progressbar" aria-label="模試のトリプル到達率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${STAGES.map(s => `<span class="mastery-seg seg-${s.key}" data-mock-seg="${s.key}"></span>`).join("")}</div>
      <ul class="mastery-legend">${STAGES.map(s => `<li><span class="dot dot-${s.key}"></span>${s.label}<b data-mock-count="${s.key}">0</b></li>`).join("")}</ul>
      <p class="panel-desc">3回連続正解でトリプル。誤答・未回答はミスに戻ります。</p>
      <p class="alert" id="mock-storage-warning" hidden>進捗を保存できません。このページを閉じると記録が失われる可能性があります。</p>
    </section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">回次</h2><p class="panel-note">複数選択可</p><button type="button" class="btn-ghost btn-small" id="mock-round-toggle">すべて解除</button></div>
      <p class="panel-desc">回次ボタンを3秒間長押しすると、その回だけの進捗をリセットできます。</p>
      <div id="mock-round-options" class="chip-group" role="group" aria-label="模試回次">${MOCK_ROUNDS.map(n => mockChip("round", n, `第${n}回<span title="トリプル到達数" class="chip-count" id="mock-round-progress-${n}">0/100</span>`)).join("")}</div>
      <details class="mock-themes"><summary>各回の独自特集・回次別進捗リセット（ボタンの数値はトリプル到達数）</summary>${mockState.sets.map(s => `<div class="mock-theme-row"><div><strong>第${s.meta.mock}回</strong>　${s.meta.specialThemes.map(escapeThemeHtml).join(" ／ ")}</div><button class="btn-ghost btn-small" type="button" data-mock-reset="${s.meta.mock}">進捗を消す</button></div>`).join("")}</details>
    </section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">出題範囲</h2><p class="panel-note">複数選択可</p><button type="button" class="btn-ghost btn-small" id="mock-range-toggle">すべて解除</button></div>
      <div class="chip-group" role="group" aria-label="模試出題範囲">${rangeLabels.map((s,i) => mockChip("range", `${i*10+1}-${i*10+10}`, `${i*10+1}〜${i*10+10}<span class="mock-chip-sub">${s}</span>`)).join("")}</div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">出題状態</h2><p class="panel-note">複数選択可</p></div><div class="chip-group" role="group" aria-label="模試出題状態">${[...STAGES].reverse().map(s => mockChip("stage", s.key, `${s.label}<span class="chip-count" data-mock-stage="${s.key}">0</span>`)).join("")}</div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">出題順</h2><p class="panel-note">1つ選択</p></div><div class="chip-group" role="radiogroup" aria-label="模試出題順">${mockChip("order","number","回次・問題番号順",true,"radio")}${mockChip("order","random","ランダム",false,"radio")}</div><p class="panel-desc">番号順では選択対象の先頭から出題します。選択肢の順序は毎回シャッフルします。</p></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">出題問数</h2><p id="mock-availability" class="panel-note" aria-live="polite"></p></div><div class="chip-group" role="radiogroup" aria-label="模試出題問数">${["all","100","50","25","20","10","5","3","1"].map(v => mockChip("count", v, v === "all" ? '対象すべて<span class="chip-count" id="mock-count-all">500</span>' : `${v}問`,v === "100","radio")).join("")}</div></section>
    <p id="mock-error" class="alert" role="alert" hidden></p>
    <button type="button" id="mock-start" class="btn-primary btn-block mock-start">選んだ条件で開始する</button>`;
  panel.addEventListener("change", updateMockPanel);
  panel.querySelector("#mock-round-toggle").addEventListener("click", () => toggleMockGroup("round"));
  panel.querySelector("#mock-range-toggle").addEventListener("click", () => toggleMockGroup("range"));
  panel.querySelector("#mock-reset-all").addEventListener("click", () => resetMockProgress());
  panel.querySelectorAll("[data-mock-reset]").forEach(b => b.addEventListener("click", () => resetMockProgress(Number(b.dataset.mockReset))));
  panel.querySelector("#mock-start").addEventListener("click", startMock);
  installExamLongPressReset("mock-round-options", resetMockProgress);
}
function mockInputs(name) { return [...document.querySelectorAll(`input[name="mock-${name}"]`)]; }
function mockValues(name) { return mockInputs(name).filter(i => i.checked).map(i => i.value); }
function toggleMockGroup(name) {
  const inputs = mockInputs(name); const check = !inputs.every(i => i.checked);
  inputs.forEach(i => { i.checked = check; }); updateMockPanel();
}
function mockRangePool() {
  const rounds = mockValues("round").map(Number), ranges = mockValues("range").map(parseRange);
  return mockState.questions.filter(q => rounds.includes(q.mock) && ranges.some(r => q.questionNumber >= r.start && q.questionNumber <= r.end));
}
function mockPool() {
  const stages = mockValues("stage"); return mockRangePool().filter(q => stages.includes(stageOfMockQuestion(q)));
}
function updateMockPanel() {
  if (!mockState.ready) return;
  const counts = mockCounts(mockState.questions);
  for (const s of STAGES) {
    document.querySelector(`[data-mock-seg="${s.key}"]`).style.width = `${counts[s.key]/5}%`;
    document.querySelector(`[data-mock-count="${s.key}"]`).textContent = counts[s.key];
  }
  const pct = Math.round(counts.triple/5);
  document.getElementById("mock-headline").textContent = `トリプル ${counts.triple} / 500（${pct}%）`;
  document.getElementById("mock-bar").setAttribute("aria-valuenow", pct);
  MOCK_ROUNDS.forEach(n => { document.getElementById(`mock-round-progress-${n}`).textContent = `${mockCounts(mockState.questions.filter(q => q.mock === n)).triple}/100`; });
  for (const name of ["round","range"]) document.getElementById(`mock-${name}-toggle`).textContent = mockInputs(name).every(i => i.checked) ? "すべて解除" : "すべて選択";
  const selectedCounts = mockCounts(mockRangePool());
  for (const s of STAGES) document.querySelector(`[data-mock-stage="${s.key}"]`).textContent = selectedCounts[s.key];
  const available = mockPool().length, inputs = mockInputs("count");
  inputs.forEach(i => { i.disabled = available === 0 || (i.value !== "all" && Number(i.value) > available); });
  if (!inputs.some(i => i.checked && !i.disabled)) { const fallback = inputs.find(i => i.value !== "all" && !i.disabled) || inputs.find(i => !i.disabled); if (fallback) fallback.checked = true; }
  document.getElementById("mock-count-all").textContent = available;
  document.getElementById("mock-availability").textContent = `現在の対象は${available}問`;
  document.getElementById("mock-start").disabled = !available || !state.allQuestions.length;
  document.getElementById("mock-error").hidden = true;
}
function resetMockProgress(round) {
  if (round !== undefined && !MOCK_ROUNDS.includes(round)) return;
  const questions = mockState.questions.filter(q => round === undefined || q.mock === round);
  const answered = questions.filter(q => stageOfMockQuestion(q) !== "new").length;
  if (!window.confirm(`${round === undefined ? "2026年度模試すべて" : `模試 第${round}回`}の${answered}問分の進捗を消去しますか？\n過去問・公開テーマ・対象外の回次には影響しません。`)) return;
  questions.forEach(q => delete mockState.progress[q.id]); saveMockProgress(); updateMockPanel();
}
function startMock() {
  const pool = mockPool(), count = mockValues("count")[0];
  const n = count === "all" ? pool.length : Number(count);
  if (!mockState.ready || !state.allQuestions.length || !Number.isInteger(n) || n < 1 || n > pool.length) return;
  state.session = { kind: "mock" };
  state.questions = (mockValues("order")[0] === "random" ? shuffle(pool) : pool).slice(0,n).map(q => ({...q, displayChoices: shuffle(q.choices)}));
  state.answers = {}; state.currentIndex = 0;
  showScreen("screen-quiz"); renderQuestion(); scrollPageTopImmediately();
}

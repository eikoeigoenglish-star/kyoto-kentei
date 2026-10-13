// =======================================================
// 公開テーマ（期間限定の独自問題セット）
//
// ・過去問（data/questions.json / kk2-progress-v1）とは完全に別管理。
// ・data/themes.json に並べたテーマのうち active:true のものだけを表示する。
//   試験終了後は active:false にする（論理削除）。問題JSONも進捗も消さない。
// ・テーマごとに別の LocalStorage キー（manifest の progressKey）で進捗を持つ。
// ・出題・選択肢シャッフル・採点・結果表示は app.js の仕組みをそのまま使う。
// ・スタート画面では「過去問トレーニング」と各公開テーマを独立した学習モードとして
//   上部のタブで切り替える。現在モードは URL の ?mode=<テーマID> で保持する。
// =======================================================

const THEME_MANIFEST_URL = "data/themes.json";
const THEME_COUNT_OPTIONS = ["10", "20", "50", "100", "all"];
const THEME_DEFAULT_COUNT = "10";

const themeState = {
  themes: [] // { manifest, meta, questions, progress, ids:Set }
};

// -----------------------
// 読み込み
// -----------------------
async function initThemes() {
  try {
    const response = await fetch(THEME_MANIFEST_URL);
    if (!response.ok) return;

    const manifest = await response.json();
    if (!Array.isArray(manifest)) return;

    // active:false のテーマは読み込まない（データ・進捗は残したまま非表示）
    const activeEntries = manifest.filter(entry => entry && entry.active === true && entry.file);

    for (const entry of activeEntries) {
      try {
        const res = await fetch(`data/${entry.file}`);
        if (!res.ok) continue;

        const data = await res.json();
        if (!data || !data.meta || data.meta.active === false || !Array.isArray(data.questions)) {
          continue;
        }

        const questions = data.questions.map(question => ({
          ...question,
          __themeId: entry.id
        }));

        themeState.themes.push({
          manifest: entry,
          meta: data.meta,
          questions,
          ids: new Set(questions.map(question => question.id)),
          progress: loadThemeProgress(entry.progressKey)
        });
      } catch (error) {
        console.warn(`公開テーマ ${entry.id} を読み込めませんでした`, error);
      }
    }

  } catch (error) {
    // テーマが読めなくても過去問は通常どおり使える
    console.warn("公開テーマの一覧を読み込めませんでした", error);
  } finally {
    renderThemeSection();
    initModeSwitch();
  }
}

window.addEventListener("DOMContentLoaded", initThemes);

function findTheme(themeId) {
  return themeState.themes.find(theme => theme.manifest.id === themeId) ?? null;
}

// -----------------------
// 進捗（テーマ専用キー）
// -----------------------
function loadThemeProgress(key) {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("公開テーマの進捗を読み込めませんでした", error);
    return {};
  }
}

function saveThemeProgress(theme) {
  if (!theme.manifest.progressKey) return;
  try {
    localStorage.setItem(theme.manifest.progressKey, JSON.stringify(theme.progress));
  } catch (error) {
    console.warn("公開テーマの進捗を保存できませんでした", error);
  }
}

function themeStageOf(theme, questionId) {
  const streak = theme.progress[questionId];

  if (streak === undefined) return "new";
  if (streak >= MAX_STREAK) return "triple";
  if (streak === 2) return "double";
  if (streak === 1) return "hit";
  return "miss";
}

function countThemeStages(theme) {
  const counts = { new: 0, miss: 0, hit: 0, double: 0, triple: 0 };
  theme.questions.forEach(question => {
    counts[themeStageOf(theme, question.id)] += 1;
  });
  return counts;
}

// app.js の結果処理から呼ばれる（テーマ問題のときだけ）
function applyThemeResult(themeId, questionId, isCorrect) {
  const theme = findTheme(themeId);
  if (!theme) return { before: "new", after: "new" };

  const before = themeStageOf(theme, questionId);
  const current = theme.progress[questionId] ?? 0;

  theme.progress[questionId] = isCorrect ? Math.min(current + 1, MAX_STREAK) : 0;

  return { before, after: themeStageOf(theme, questionId) };
}

function stageOfThemeQuestion(question) {
  const theme = findTheme(question.__themeId);
  return theme ? themeStageOf(theme, question.id) : "new";
}

function themeQuestionLabel(question) {
  const theme = findTheme(question.__themeId);
  const label = theme ? `${theme.manifest.label}「${theme.manifest.title}」` : "公開テーマ";
  return `${label}　第${question.questionNumber}問`;
}

function finishThemeSession(themeId) {
  const theme = findTheme(themeId);
  if (!theme) return;
  saveThemeProgress(theme);
  renderThemeSection();
}

// -----------------------
// 画面（公開テーマモードのパネル）
// -----------------------
function renderThemeSection() {
  const area = document.getElementById("theme-area");
  if (!area) return;

  if (themeState.themes.length === 0) {
    area.innerHTML = "";
    area.hidden = true;
    return;
  }

  // 既に描画済みなら数値だけ更新（選択状態を保つ）
  const alreadyRendered = themeState.themes.every(theme =>
    document.getElementById(`${theme.manifest.id}-panel`)
  );

  if (!alreadyRendered) {
    area.innerHTML = "";
    themeState.themes.forEach(theme => {
      area.appendChild(createThemePanel(theme));
    });
  }

  themeState.themes.forEach(updateThemePanel);
  applyModeVisibility();
}

// =======================================================
// 学習モード切替（過去問トレーニング ⇔ 公開テーマ）
//
// ・モードは「過去問（past）」と、active な各テーマ（テーマID）。
// ・選択中のモード以外の設定UI・進捗UIは hidden で完全に非表示にする。
// ・URL の ?mode=<テーマID> で現在モードを保持する（過去問はパラメータなし）。
//   旧リンク #theme-area や #<テーマID> で来た場合もテーマモードとして開く。
// ・active なテーマが無ければ切替UI自体を出さない。
// =======================================================
const MODE_PARAM = "mode";
const PAST_MODE = "past";
const PAST_LEAD_TEXT = document.getElementById("app-lead")?.textContent ?? "";

themeState.mode = PAST_MODE;

function readRequestedMode() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get(MODE_PARAM);
  if (fromQuery) return fromQuery;

  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (hash === "theme-area") return "theme";       // 旧リンク互換：先頭のテーマへ
  if (hash.startsWith("theme-")) return hash;

  return PAST_MODE;
}

function resolveMode(requested) {
  if (!requested || requested === PAST_MODE) return PAST_MODE;
  if (requested === "theme") return themeState.themes[0]?.manifest.id ?? PAST_MODE;
  return findTheme(requested) ? requested : PAST_MODE;
}

function modeUrl(mode) {
  const url = new URL(window.location.href);
  url.hash = "";
  if (mode === PAST_MODE) {
    url.searchParams.delete(MODE_PARAM);
  } else {
    url.searchParams.set(MODE_PARAM, mode);
  }
  return url.pathname + url.search;
}

// テーマモード指定で開いたとき、テーマ読込完了まで過去問UIを出さない（ちらつき防止）
if (readRequestedMode() !== PAST_MODE) {
  document.documentElement.classList.add("mode-pending");
}

function initModeSwitch() {
  buildModeSwitch();

  const requested = readRequestedMode();
  const mode = resolveMode(requested);

  // 無効なモード（active:false のテーマなど）が指定されていたら URL から外す
  const needsCleanUrl = requested !== mode || window.location.hash !== "";
  setMode(mode, { history: needsCleanUrl ? "replace" : "none" });

  document.documentElement.classList.remove("mode-pending");

  window.addEventListener("popstate", () => {
    setMode(resolveMode(readRequestedMode()), { history: "none" });
  });
}

function buildModeSwitch() {
  const nav = document.getElementById("mode-switch");
  const link = document.getElementById("theme-nav");
  if (!nav) return;

  // 過去問タブ以外（以前に描いたテーマタブ）を作り直す
  nav.querySelectorAll("[data-theme-tab]").forEach(tab => tab.remove());

  if (themeState.themes.length === 0) {
    nav.hidden = true;
    if (link) link.hidden = true;
    return;
  }

  themeState.themes.forEach(theme => {
    const id = theme.manifest.id;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "mode-tab mode-tab-theme";
    tab.id = `mode-tab-${id}`;
    tab.dataset.mode = id;
    tab.dataset.themeTab = "";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${id}-panel`);
    tab.innerHTML =
      `<span class="mode-tab-main">${escapeThemeHtml(theme.manifest.label)}対策</span>` +
      `<span class="mode-tab-sub">${escapeThemeHtml(theme.manifest.title)}・${theme.questions.length}問</span>`;
    nav.appendChild(tab);

    const panel = document.getElementById(`${id}-panel`);
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
    }
  });

  if (!nav.dataset.bound) {
    nav.dataset.bound = "1";
    nav.addEventListener("click", event => {
      const tab = event.target.closest("[data-mode]");
      if (!tab) return;
      setMode(tab.dataset.mode, { history: "push" });
    });
    nav.addEventListener("keydown", handleModeTabKeydown);
  }

  nav.hidden = false;

  // ヘッダーの案内リンクは「先頭テーマのモードへ切替」として動作させる
  if (link) {
    const first = themeState.themes[0];
    const anchor = link.querySelector("a");
    anchor.href = modeUrl(first.manifest.id);
    anchor.textContent = `${first.manifest.label}「${first.manifest.title}」の対策はこちら →`;
    if (!anchor.dataset.bound) {
      anchor.dataset.bound = "1";
      anchor.addEventListener("click", event => {
        event.preventDefault();
        setMode(first.manifest.id, { history: "push" });
        document.getElementById("mode-switch")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
}

function handleModeTabKeydown(event) {
  const tabs = [...document.querySelectorAll("#mode-switch [role='tab']")];
  const index = tabs.indexOf(document.activeElement);
  if (index === -1) return;

  let next = null;
  if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
  if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
  if (event.key === "Home") next = tabs[0];
  if (event.key === "End") next = tabs[tabs.length - 1];
  if (!next) return;

  event.preventDefault();
  next.focus();
  setMode(next.dataset.mode, { history: "push" });
}

function setMode(mode, { history = "push" } = {}) {
  const resolved = resolveMode(mode);
  const changed = resolved !== themeState.mode;
  themeState.mode = resolved;

  applyModeVisibility();

  if (history === "push" && changed) {
    window.history.pushState({ mode: resolved }, "", modeUrl(resolved));
  } else if (history === "replace" || (history === "push" && !changed)) {
    window.history.replaceState({ mode: resolved }, "", modeUrl(resolved));
  }
}

// 現在モード以外の設定UI・進捗UIを完全に非表示にする
function applyModeVisibility() {
  const mode = resolveMode(themeState.mode);
  const isPast = mode === PAST_MODE;

  const pastPanel = document.getElementById("mode-past");
  if (pastPanel) pastPanel.hidden = !isPast;

  const area = document.getElementById("theme-area");
  if (area) area.hidden = isPast || themeState.themes.length === 0;

  themeState.themes.forEach(theme => {
    const panel = document.getElementById(`${theme.manifest.id}-panel`);
    if (panel) panel.hidden = theme.manifest.id !== mode;
  });

  document.querySelectorAll("#mode-switch [role='tab']").forEach(tab => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle("is-active", selected);
  });

  const link = document.getElementById("theme-nav");
  if (link) link.hidden = !isPast || themeState.themes.length === 0;

  const lead = document.getElementById("app-lead");
  if (lead) {
    const theme = findTheme(mode);
    lead.textContent = theme
      ? `公開テーマ「${theme.manifest.title}」${theme.questions.length}問すべてをトリプルにするのが目標です。`
      : PAST_LEAD_TEXT;
  }

  document.body.dataset.mode = isPast ? PAST_MODE : "theme";
}

function createThemePanel(theme) {
  const id = theme.manifest.id;
  const total = theme.questions.length;

  const section = document.createElement("section");
  section.className = "panel theme-panel";
  section.id = `${id}-panel`;
  section.setAttribute("aria-labelledby", `${id}-heading`);
  section.hidden = true;

  section.innerHTML = `
    <p class="theme-eyebrow">
      <span class="theme-badge">期間限定</span>
      <span>${escapeThemeHtml(theme.manifest.label)}</span>
    </p>
    <h2 id="${id}-heading" class="theme-title">${escapeThemeHtml(theme.manifest.title)}</h2>
    <p class="panel-desc theme-desc">${escapeThemeHtml(theme.meta.description || "")}</p>
    <p class="panel-desc theme-desc">本試験では公開テーマから10問程度の出題が見込まれます。この${total}問は過去問ではない独自問題で、進捗は過去問とは別に記録されます。</p>

    <div class="theme-progress">
      <div class="panel-head">
        <h3 class="theme-subtitle">公開テーマの進捗</h3>
        <p id="${id}-headline" class="mastery-headline theme-headline"></p>
        <button type="button" id="${id}-reset" class="btn-ghost btn-small">テーマの進捗を消す</button>
      </div>

      <div class="mastery-bar" id="${id}-bar" role="progressbar"
           aria-label="公開テーマのトリプル到達率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="mastery-seg seg-triple" data-seg="triple"></span>
        <span class="mastery-seg seg-double" data-seg="double"></span>
        <span class="mastery-seg seg-hit" data-seg="hit"></span>
        <span class="mastery-seg seg-miss" data-seg="miss"></span>
        <span class="mastery-seg seg-new" data-seg="new"></span>
      </div>

      <ul class="mastery-legend">
        <li><span class="dot dot-triple"></span>トリプル<b data-count="triple">0</b></li>
        <li><span class="dot dot-double"></span>ダブル<b data-count="double">0</b></li>
        <li><span class="dot dot-hit"></span>ヒット<b data-count="hit">0</b></li>
        <li><span class="dot dot-miss"></span>ミス<b data-count="miss">0</b></li>
        <li><span class="dot dot-new"></span>未出題<b data-count="new">0</b></li>
      </ul>
    </div>

    <div class="theme-block">
      <h3 class="theme-subtitle">出題対象</h3>
      <div class="chip-group" role="radiogroup" aria-label="公開テーマの出題対象">
        <input type="radio" id="${id}-scope-all" name="${id}-scope" value="all" checked>
        <label class="chip chip-wide" for="${id}-scope-all">全${total}問から</label>

        <input type="radio" id="${id}-scope-untripled" name="${id}-scope" value="untripled">
        <label class="chip chip-wide" for="${id}-scope-untripled">トリプル以外<span class="chip-count" data-scope-count="untripled">0</span></label>

        <input type="radio" id="${id}-scope-weak" name="${id}-scope" value="weak">
        <label class="chip chip-wide" for="${id}-scope-weak">ミス・未出題<span class="chip-count" data-scope-count="weak">0</span></label>
      </div>
    </div>

    <div class="theme-block">
      <h3 class="theme-subtitle">出題問数</h3>
      <div class="chip-group" role="radiogroup" aria-label="公開テーマの出題問数">
        ${THEME_COUNT_OPTIONS.map(value => `
          <input type="radio" id="${id}-count-${value}" name="${id}-count" value="${value}" ${value === THEME_DEFAULT_COUNT ? "checked" : ""}>
          <label class="chip${value === "all" ? " chip-wide" : ""}" for="${id}-count-${value}">${value === "all" ? `対象すべて<span class="chip-count" data-count-all>0</span>` : `${value}問`}</label>
        `).join("")}
      </div>
    </div>

    <div id="${id}-error" class="alert" role="alert" hidden></div>

    <div class="theme-actions">
      <button type="button" id="${id}-mock" class="btn-primary btn-block theme-btn">公開テーマ模擬 10問（ランダム）</button>
      <button type="button" id="${id}-start" class="btn-secondary btn-block">選んだ条件で開始する</button>
    </div>
  `;

  section.querySelector(`#${id}-reset`).addEventListener("click", () => resetThemeProgress(id));
  section.querySelector(`#${id}-mock`).addEventListener("click", () => startTheme(id, { count: "10", scope: "all" }));
  section.querySelector(`#${id}-start`).addEventListener("click", () => startTheme(id));
  section.addEventListener("change", event => {
    if (event.target.name === `${id}-scope`) updateThemePanel(theme);
  });

  return section;
}

function themeScopePool(theme, scope) {
  return theme.questions.filter(question => {
    const stage = themeStageOf(theme, question.id);
    if (scope === "untripled") return stage !== "triple";
    if (scope === "weak") return stage === "miss" || stage === "new";
    return true;
  });
}

function updateThemePanel(theme) {
  const id = theme.manifest.id;
  const panel = document.getElementById(`${id}-panel`);
  if (!panel) return;

  const counts = countThemeStages(theme);
  const total = theme.questions.length;

  ["triple", "double", "hit", "miss", "new"].forEach(key => {
    panel.querySelector(`[data-seg="${key}"]`).style.width = `${(counts[key] / total) * 100}%`;
    panel.querySelector(`[data-count="${key}"]`).textContent = String(counts[key]);
  });

  const triplePercent = Math.round((counts.triple / total) * 100);
  document.getElementById(`${id}-headline`).textContent =
    `トリプル ${counts.triple} / ${total}　（${triplePercent}%）`;

  const bar = document.getElementById(`${id}-bar`);
  bar.setAttribute("aria-valuenow", String(triplePercent));
  bar.setAttribute(
    "aria-valuetext",
    `公開テーマ全${total}問中、トリプル${counts.triple}問、ダブル${counts.double}問、` +
    `ヒット${counts.hit}問、ミス${counts.miss}問、未出題${counts.new}問`
  );

  panel.querySelector('[data-scope-count="untripled"]').textContent = String(total - counts.triple);
  panel.querySelector('[data-scope-count="weak"]').textContent = String(counts.miss + counts.new);

  // 出題対象に応じて選べる問数を制御（過去問側と同じ考え方）
  const scope = panel.querySelector(`input[name="${id}-scope"]:checked`)?.value ?? "all";
  const available = themeScopePool(theme, scope).length;
  const countInputs = [...panel.querySelectorAll(`input[name="${id}-count"]`)];

  countInputs.forEach(input => {
    input.disabled = input.value === "all" ? available === 0 : Number(input.value) > available;
  });
  panel.querySelector("[data-count-all]").textContent = String(available);

  const selected = panel.querySelector(`input[name="${id}-count"]:checked`);
  if (!selected || selected.disabled) {
    const fallback = countInputs.find(input => input.value !== "all" && !input.disabled) ??
      countInputs.find(input => !input.disabled);
    if (fallback) fallback.checked = true;
  }

  document.getElementById(`${id}-start`).disabled = available === 0;
  document.getElementById(`${id}-mock`).disabled = total < 10;
  hideThemeError(id);
}

function resetThemeProgress(themeId) {
  const theme = findTheme(themeId);
  if (!theme) return;

  const answered = theme.questions.length - countThemeStages(theme).new;
  if (answered === 0) return;

  const ok = window.confirm(
    `公開テーマ「${theme.manifest.title}」の${answered}問分の進捗を消して、未出題に戻します。` +
    "過去問の進捗は消えません。よろしいですか。"
  );
  if (!ok) return;

  // このテーマのキーだけを空にする（過去問の kk2-progress-v1 には触れない）
  theme.progress = {};
  saveThemeProgress(theme);
  updateThemePanel(theme);
}

// -----------------------
// 出題開始
// -----------------------
function startTheme(themeId, override = {}) {
  const theme = findTheme(themeId);
  if (!theme) return;

  const panel = document.getElementById(`${themeId}-panel`);
  const scope = override.scope ??
    panel.querySelector(`input[name="${themeId}-scope"]:checked`)?.value ?? "all";
  const countValue = override.count ??
    panel.querySelector(`input[name="${themeId}-count"]:checked`)?.value ?? THEME_DEFAULT_COUNT;

  const pool = themeScopePool(theme, scope);

  if (pool.length === 0) {
    showThemeError(themeId, "選択した条件に該当する問題がありません。");
    return;
  }

  const questionCount = countValue === "all" ? pool.length : Number(countValue);

  if (pool.length < questionCount) {
    showThemeError(themeId, `選択した条件には${pool.length}問しかありません。出題問数を${pool.length}問以下にしてください。`);
    return;
  }

  state.session = { kind: "theme", themeId };
  state.questions = shuffle(pool)
    .slice(0, questionCount)
    .map(question => ({
      ...question,
      displayChoices: shuffle(question.choices)
    }));
  state.answers = {};
  state.currentIndex = 0;

  showScreen("screen-quiz");
  renderQuestion();
  scrollPageTopImmediately();
}

function showThemeError(themeId, message) {
  const area = document.getElementById(`${themeId}-error`);
  if (!area) return;
  area.textContent = message;
  area.hidden = false;
}

function hideThemeError(themeId) {
  const area = document.getElementById(`${themeId}-error`);
  if (!area) return;
  area.textContent = "";
  area.hidden = true;
}

function escapeThemeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

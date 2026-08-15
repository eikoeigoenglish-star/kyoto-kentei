// =======================
// 設定
// =======================
const VALID_EXAMS = [12, 13, 14, 15, 16, 17, 19, 21, 23, 25, 27];
const CHOICE_MARKERS = ["1", "2", "3", "4"];
const STORAGE_KEY = "kk2-progress-v1";

// 習得段階。streak（連続正解数）から決まる。
// 未出題 = 記録なし / ミス = 0 / ヒット = 1 / ダブル = 2 / トリプル = 3
const STAGES = [
  { key: "triple", label: "トリプル", streak: 3 },
  { key: "double", label: "ダブル", streak: 2 },
  { key: "hit", label: "ヒット", streak: 1 },
  { key: "miss", label: "ミス", streak: 0 },
  { key: "new", label: "未出題", streak: null }
];

const MAX_STREAK = 3;

// =======================
// 状態
// =======================
const state = {
  allQuestions: [],
  questions: [],
  answers: {},
  currentIndex: 0,
  progress: {}
};

// =======================
// 進捗の保存と読み込み
// =======================
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("進捗を読み込めませんでした", error);
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  } catch (error) {
    console.warn("進捗を保存できませんでした", error);
    showStorageWarning();
  }
}

function showStorageWarning() {
  const note = document.getElementById("mastery-note");
  if (note) {
    note.textContent = "この環境では進捗を保存できません。閉じるとリセットされます。";
  }
}

function stageOf(questionId) {
  const streak = state.progress[questionId];

  if (streak === undefined) return "new";
  if (streak >= MAX_STREAK) return "triple";
  if (streak === 2) return "double";
  if (streak === 1) return "hit";
  return "miss";
}

function stageLabel(key) {
  return STAGES.find(stage => stage.key === key)?.label ?? "";
}

// =======================
// 初期化
// =======================
async function init() {
  try {
    const response = await fetch("data/questions.json");

    if (!response.ok) {
      throw new Error(`questions.json の読込に失敗しました（HTTP ${response.status}）`);
    }

    const questions = await response.json();

    if (!Array.isArray(questions)) {
      throw new Error("questions.json の形式が配列ではありません。");
    }

    state.allQuestions = questions;
    state.progress = loadProgress();

    renderMastery();
    updateAvailableCounts();

    document.getElementById("start-btn").addEventListener("click", startExam);
    document.getElementById("next-btn").addEventListener("click", nextQuestion);
    document.getElementById("back-to-start-btn").addEventListener("click", backToStart);
    document.getElementById("range-toggle-btn").addEventListener("click", toggleAllRanges);
    document.getElementById("reset-progress-btn").addEventListener("click", resetProgress);
    document.addEventListener("keydown", handleQuizKeydown);
  } catch (error) {
    showStartError(error.message || "問題データを読み込めませんでした。");
    document.getElementById("start-btn").disabled = true;
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", init);

// =======================
// 進捗バーと内訳
// =======================
function countStages() {
  const counts = { new: 0, miss: 0, hit: 0, double: 0, triple: 0 };

  state.allQuestions.forEach(question => {
    counts[stageOf(question.id)] += 1;
  });

  return counts;
}

function renderMastery() {
  const counts = countStages();
  const total = state.allQuestions.length;

  if (total === 0) return;

  // バーは習得が進んだ順に左から積む。全部トリプル＝金一色が目標。
  ["triple", "double", "hit", "miss", "new"].forEach(key => {
    const percent = (counts[key] / total) * 100;
    document.getElementById(`seg-${key}`).style.width = `${percent}%`;
  });

  STAGES.forEach(stage => {
    const countEl = document.getElementById(`count-${stage.key}`);
    if (countEl) countEl.textContent = String(counts[stage.key]);

    const chipCount = document.getElementById(`chip-count-${stage.key}`);
    if (chipCount) chipCount.textContent = String(counts[stage.key]);
  });

  const triplePercent = Math.round((counts.triple / total) * 100);
  document.getElementById("mastery-headline").textContent =
    `トリプル ${counts.triple} / ${total}　（${triplePercent}%）`;

  const bar = document.getElementById("mastery-bar");
  bar.setAttribute("aria-valuenow", String(triplePercent));
  bar.setAttribute(
    "aria-valuetext",
    `全${total}問中、トリプル${counts.triple}問、ダブル${counts.double}問、` +
    `ヒット${counts.hit}問、ミス${counts.miss}問、未出題${counts.new}問`
  );
}

function resetProgress() {
  const answered = state.allQuestions.length - countStages().new;

  if (answered === 0) {
    return;
  }

  const ok = window.confirm(
    `${answered}問分の進捗をすべて消して、全問を未出題に戻します。よろしいですか。`
  );

  if (!ok) return;

  state.progress = {};
  saveProgress();
  renderMastery();
  updateAvailableCounts();
}

// =======================
// 出題範囲 一括選択／解除
// =======================
function toggleAllRanges() {
  const inputs = [...document.querySelectorAll('input[name="range"]')];
  const allChecked = inputs.every(input => input.checked);
  const next = !allChecked;

  inputs.forEach(input => {
    input.checked = next;
  });

  updateRangeToggleLabel();
  updateAvailableCounts();
}

function updateRangeToggleLabel() {
  const inputs = [...document.querySelectorAll('input[name="range"]')];
  const allChecked = inputs.every(input => input.checked);

  document.getElementById("range-toggle-btn").textContent =
    allChecked ? "すべて解除" : "すべて選択";
}

document.addEventListener("change", event => {
  const name = event.target.name;

  if (name === "range") {
    updateRangeToggleLabel();
  }

  if (name === "range" || name === "exam" || name === "stage" || name === "freq") {
    updateAvailableCounts();
  }
});

// =======================
// 試験開始
// =======================
function startExam() {
  clearStartError();

  const examValue = document.querySelector('input[name="exam"]:checked')?.value;
  const countValue = document.querySelector('input[name="count"]:checked')?.value;
  const filters = readFilters();

  if (!examValue || !countValue) {
    showStartError("回次と出題問数を選択してください。");
    return;
  }

  if (filters.ranges.length === 0) {
    showStartError("出題範囲を1つ以上選択してください。");
    return;
  }

  if (filters.stages.length === 0) {
    showStartError("出題状態を1つ以上選択してください。");
    return;
  }

  if (filters.freqs.length === 0) {
    showStartError("頻出度を1つ以上選択してください。");
    return;
  }

  const questionCount = Number(countValue);
  const pool = filterQuestions(state.allQuestions, filters);

  if (pool.length === 0) {
    showStartError("選択した条件に該当する問題がありません。");
    return;
  }

  if (pool.length < questionCount) {
    showStartError(
      `選択した条件には${pool.length}問しかありません。` +
      `出題問数を${pool.length}問以下にしてください。`
    );
    return;
  }

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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =======================
// 出題対象の抽出
// =======================
function readFilters() {
  const examValue = document.querySelector('input[name="exam"]:checked')?.value;

  return {
    exam: examValue === "all" ? "all" : Number(examValue),
    ranges: [...document.querySelectorAll('input[name="range"]:checked')]
      .map(input => parseRange(input.value)),
    stages: [...document.querySelectorAll('input[name="stage"]:checked')]
      .map(input => input.value),
    freqs: [...document.querySelectorAll('input[name="freq"]:checked')]
      .map(input => input.value)
  };
}

function filterQuestions(allQuestions, filters) {
  return allQuestions.filter(question => {
    const examMatches =
      filters.exam === "all"
        ? VALID_EXAMS.includes(Number(question.exam))
        : Number(question.exam) === filters.exam;

    if (!examMatches) return false;

    const number = Number(question.questionNumber);
    const rangeMatches = filters.ranges.some(
      range => number >= range.start && number <= range.end
    );

    if (!rangeMatches) return false;

    if (!filters.stages.includes(stageOf(question.id))) return false;

    return filters.freqs.includes(question.freq);
  });
}

function parseRange(value) {
  const [start, end] = value.split("-").map(Number);
  return { start, end };
}

// =======================
// 選択条件に応じた出題問数の制御
// =======================
function updateAvailableCounts() {
  if (state.allQuestions.length === 0) {
    return;
  }

  const filters = readFilters();

  const ready =
    filters.exam !== undefined &&
    filters.ranges.length > 0 &&
    filters.stages.length > 0 &&
    filters.freqs.length > 0;

  const availableCount = ready
    ? filterQuestions(state.allQuestions, filters).length
    : 0;

  const countInputs = [...document.querySelectorAll('input[name="count"]')];

  countInputs.forEach(input => {
    input.disabled = Number(input.value) > availableCount;
  });

  const selectedInput = document.querySelector('input[name="count"]:checked');

  if (!selectedInput || selectedInput.disabled) {
    const largestAvailable = countInputs.find(input => !input.disabled);

    if (largestAvailable) {
      largestAvailable.checked = true;
    }
  }

  const availability = document.getElementById("count-availability");

  if (availableCount === 0) {
    availability.textContent = "条件に合う問題がありません";
  } else {
    availability.textContent = `1つ選択・現在の対象は${availableCount}問`;
  }

  document.getElementById("start-btn").disabled = availableCount === 0;
  clearStartError();
}

// Fisher-Yates shuffle
function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// =======================
// 問題表示
// =======================
function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const total = state.questions.length;
  const current = state.currentIndex + 1;

  document.getElementById("question-meta").textContent =
    `第${question.exam}回　第${question.questionNumber}問`;

  const stageTag = document.getElementById("question-stage");
  stageTag.textContent = stageLabel(stageOf(question.id));
  stageTag.className = `stage-tag stage-${stageOf(question.id)}`;

  document.getElementById("question-counter").textContent =
    `${current} / ${total}`;

  updateProgress(current, total);

  const questionText = document.getElementById("question-text");
  questionText.textContent = question.question;

  const answerArea = document.getElementById("answer-area");
  answerArea.innerHTML = "";

  renderChoice(answerArea, question);
  restoreAnswer(question);

  const nextButton = document.getElementById("next-btn");
  nextButton.textContent =
    state.currentIndex === total - 1 ? "結果を見る" : "次へ";

  // スクリーンリーダーに新しい問題を読み上げさせる
  questionText.focus({ preventScroll: true });
}

function updateProgress(current, total) {
  const percent = Math.round((current / total) * 100);

  document.getElementById("progress-fill").style.width = `${percent}%`;
  document.getElementById("progress-bar").setAttribute("aria-valuenow", String(percent));
}

// =======================
// 四択UI
// =======================
function renderChoice(area, question) {
  question.displayChoices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-btn";
    button.dataset.choice = choice;
    button.setAttribute("aria-pressed", "false");

    const marker = document.createElement("span");
    marker.className = "choice-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = CHOICE_MARKERS[index];

    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = choice;

    button.append(marker, text);

    button.addEventListener("click", () => {
      state.answers[question.id] = choice;
      highlightChoice(area, choice);
    });

    area.appendChild(button);
  });
}

function highlightChoice(container, selectedChoice) {
  [...container.querySelectorAll(".choice-btn")].forEach(button => {
    const selected = button.dataset.choice === selectedChoice;

    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

// =======================
// 回答復元
// =======================
function restoreAnswer(question) {
  const answer = state.answers[question.id];

  if (answer === undefined) {
    return;
  }

  highlightChoice(document.getElementById("answer-area"), answer);
}

// =======================
// キーボード操作（1〜4で選択、Enterで次へ）
// =======================
function handleQuizKeydown(event) {
  const quizScreen = document.getElementById("screen-quiz");

  if (quizScreen.hidden) {
    return;
  }

  // 修飾キー付きは無視
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const keyIndex = CHOICE_MARKERS.indexOf(event.key);

  if (keyIndex !== -1) {
    const buttons = document.querySelectorAll("#answer-area .choice-btn");

    if (buttons[keyIndex]) {
      buttons[keyIndex].click();
      event.preventDefault();
    }
    return;
  }

  // 「次へ」にフォーカスがあるときだけ既定の動作に任せ、
  // それ以外（選択肢をクリックした直後など）は Enter で先に進む
  if (event.key === "Enter" && document.activeElement.id !== "next-btn") {
    nextQuestion();
    event.preventDefault();
  }
}

// =======================
// 次へ
// =======================
function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  showResult();
}

// =======================
// 採点
// =======================
function normalize(value) {
  return String(value ?? "").trim();
}

function judge(question, answer) {
  return normalize(answer) === normalize(question.correct);
}

// 正解なら1段上げる（トリプルで打ち止め）。誤答と未回答はミスに戻す。
function applyResult(questionId, isCorrect) {
  const before = stageOf(questionId);
  const current = state.progress[questionId] ?? 0;

  state.progress[questionId] = isCorrect
    ? Math.min(current + 1, MAX_STREAK)
    : 0;

  return { before, after: stageOf(questionId) };
}

// =======================
// 結果表示
// =======================
function showResult() {
  showScreen("screen-result");

  let correctCount = 0;
  const list = document.getElementById("result-list");
  list.innerHTML = "";

  const transitions = state.questions.map(question => {
    const answer = state.answers[question.id];
    const isCorrect = judge(question, answer);

    if (isCorrect) {
      correctCount += 1;
    }

    return { question, answer, isCorrect, ...applyResult(question.id, isCorrect) };
  });

  saveProgress();
  renderMastery();
  updateAvailableCounts();

  transitions.forEach((entry, index) => {
    list.appendChild(createResultItem(entry, index));
  });

  const total = state.questions.length;
  const percent = Math.round((correctCount / total) * 100);

  const score = document.getElementById("score");
  score.innerHTML = "";

  const scoreNum = document.createElement("span");
  scoreNum.className = "score-num";
  scoreNum.textContent = String(correctCount);

  score.append("得点 ", scoreNum, ` / ${total}`);

  document.getElementById("score-percent").textContent = `正答率 ${percent}%`;
  document.getElementById("score-sub").textContent =
    percent === 100 ? "全問正解です。見事。" :
    percent >= 70 ? "合格ライン（70%）に到達しています。" :
    "合格ラインは70%です。復習して再挑戦しましょう。";

  const promoted = transitions.filter(entry => entry.after === "triple" && entry.before !== "triple").length;
  const dropped = transitions.filter(entry => !entry.isCorrect && entry.before !== "new" && entry.before !== "miss").length;

  const changes = [];
  if (promoted > 0) changes.push(`トリプル到達 ${promoted}問`);
  if (dropped > 0) changes.push(`ミスに後退 ${dropped}問`);

  document.getElementById("score-changes").textContent = changes.join("　／　");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createResultItem(entry, index) {
  const { question, answer, isCorrect, before, after } = entry;

  const item = document.createElement("li");
  item.className = `result-item ${isCorrect ? "is-correct" : "is-incorrect"}`;

  const badge = document.createElement("span");
  badge.className = "result-badge";
  badge.textContent = isCorrect ? "○" : "×";
  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", isCorrect ? "正解" : "不正解");

  const body = document.createElement("div");
  body.className = "result-body";

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent =
    `Q${index + 1}　第${question.exam}回　第${question.questionNumber}問`;

  if (question.freq === "high") {
    const freqTag = document.createElement("span");
    freqTag.className = "freq-tag";
    freqTag.textContent = `頻出 ${question.answerRounds}回`;
    meta.append("　", freqTag);
  }

  const text = document.createElement("p");
  text.className = "result-question";
  text.textContent = question.question;

  const answers = document.createElement("dl");
  answers.className = "result-answers";

  answers.appendChild(
    createAnswerLine("正解", question.correct, "answer-correct")
  );

  const userText = answer === undefined ? "未回答" : answer;
  answers.appendChild(
    createAnswerLine(
      "あなたの答え",
      userText,
      isCorrect ? "answer-correct" : "answer-wrong"
    )
  );

  const transition = document.createElement("p");
  transition.className = "result-transition";

  const fromTag = document.createElement("span");
  fromTag.className = `stage-tag stage-${before}`;
  fromTag.textContent = stageLabel(before);

  const toTag = document.createElement("span");
  toTag.className = `stage-tag stage-${after}`;
  toTag.textContent = stageLabel(after);

  transition.append(fromTag, " → ", toTag);

  body.append(meta, text, answers, transition);
  item.append(badge, body);

  return item;
}

function createAnswerLine(labelText, value, valueClass) {
  const line = document.createElement("div");

  const label = document.createElement("dt");
  label.textContent = labelText;

  const detail = document.createElement("dd");
  detail.textContent = value;
  detail.className = valueClass;

  line.append(label, detail);

  return line;
}

// =======================
// エラー表示
// =======================
function showStartError(message) {
  const area = document.getElementById("start-error");
  area.textContent = message;
  area.hidden = false;
}

function clearStartError() {
  const area = document.getElementById("start-error");
  area.textContent = "";
  area.hidden = true;
}

// =======================
// 画面切り替え
// =======================
function showScreen(id) {
  ["screen-start", "screen-quiz", "screen-result"].forEach(screenId => {
    document.getElementById(screenId).hidden = true;
  });

  document.getElementById(id).hidden = false;
}

// =======================
// 戻る
// =======================
function backToStart() {
  state.questions = [];
  state.answers = {};
  state.currentIndex = 0;

  renderMastery();
  updateAvailableCounts();
  showScreen("screen-start");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =======================
// 設定
// =======================
const VALID_EXAMS = [12, 13, 14, 15, 16, 17, 19, 21, 23, 25, 27];
const CHOICE_MARKERS = ["1", "2", "3", "4"];

// =======================
// 状態
// =======================
const state = {
  allQuestions: [],
  questions: [],
  answers: {},
  currentIndex: 0
};

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
    updateAvailableCounts();

    document.getElementById("start-btn").addEventListener("click", startExam);
    document.getElementById("next-btn").addEventListener("click", nextQuestion);
    document.getElementById("back-to-start-btn").addEventListener("click", backToStart);
    document.getElementById("range-toggle-btn").addEventListener("click", toggleAllRanges);
    document.addEventListener("keydown", handleQuizKeydown);
  } catch (error) {
    showStartError(error.message || "問題データを読み込めませんでした。");
    document.getElementById("start-btn").disabled = true;
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", init);

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
  if (event.target.name === "range") {
    updateRangeToggleLabel();
  }

  if (event.target.name === "range" || event.target.name === "exam") {
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
  const checkedRanges = [
    ...document.querySelectorAll('input[name="range"]:checked')
  ].map(input => parseRange(input.value));

  if (!examValue || !countValue) {
    showStartError("回次と出題問数を選択してください。");
    return;
  }

  if (checkedRanges.length === 0) {
    showStartError("出題範囲を1つ以上選択してください。");
    return;
  }

  const exam = examValue === "all" ? "all" : Number(examValue);
  const questionCount = Number(countValue);
  const pool = filterQuestions(state.allQuestions, exam, checkedRanges);

  if (pool.length === 0) {
    showStartError("選択した条件に該当する問題がありません。");
    return;
  }

  if (pool.length < questionCount) {
    showStartError(
      `選択した範囲には${pool.length}問しかありません。` +
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
function filterQuestions(allQuestions, exam, ranges) {
  return allQuestions.filter(question => {
    const examMatches =
      exam === "all"
        ? VALID_EXAMS.includes(Number(question.exam))
        : Number(question.exam) === exam;

    const number = Number(question.questionNumber);
    const rangeMatches = ranges.some(
      range => number >= range.start && number <= range.end
    );

    return examMatches && rangeMatches;
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

  const examValue =
    document.querySelector('input[name="exam"]:checked')?.value;

  const checkedRanges = [
    ...document.querySelectorAll('input[name="range"]:checked')
  ].map(input => parseRange(input.value));

  const exam = examValue === "all" ? "all" : Number(examValue);

  const availableCount =
    examValue && checkedRanges.length > 0
      ? filterQuestions(state.allQuestions, exam, checkedRanges).length
      : 0;

  const countInputs = [
    ...document.querySelectorAll('input[name="count"]')
  ];

  countInputs.forEach(input => {
    input.disabled = Number(input.value) > availableCount;
  });

  const selectedInput =
    document.querySelector('input[name="count"]:checked');

  if (!selectedInput || selectedInput.disabled) {
    const largestAvailable = countInputs.find(input => !input.disabled);

    if (largestAvailable) {
      largestAvailable.checked = true;
    }
  }

  const availability = document.getElementById("count-availability");

  if (availableCount === 0) {
    availability.textContent = "出題範囲を選択してください";
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
  const percent = Math.round(((current - 1) / total) * 100);

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

  const keyIndex = ["1", "2", "3", "4"].indexOf(event.key);

  if (keyIndex !== -1) {
    const buttons = document.querySelectorAll("#answer-area .choice-btn");

    if (buttons[keyIndex]) {
      buttons[keyIndex].click();
      event.preventDefault();
    }
    return;
  }

  if (event.key === "Enter" && document.activeElement.tagName !== "BUTTON") {
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

// =======================
// 結果表示
// =======================
function showResult() {
  showScreen("screen-result");

  let correctCount = 0;
  const list = document.getElementById("result-list");
  list.innerHTML = "";

  state.questions.forEach((question, index) => {
    const answer = state.answers[question.id];
    const isCorrect = judge(question, answer);

    if (isCorrect) {
      correctCount += 1;
    }

    list.appendChild(createResultItem(question, answer, isCorrect, index));
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

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createResultItem(question, answer, isCorrect, index) {
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

  body.append(meta, text, answers);
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

  showScreen("screen-start");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

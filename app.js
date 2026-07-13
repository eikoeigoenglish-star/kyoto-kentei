// =======================
// 設定
// =======================
const VALID_EXAMS = [12, 13, 14, 15, 16, 17, 19, 21, 23, 25];

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

    document.getElementById("start-btn").addEventListener("click", startExam);
    document.getElementById("next-btn").addEventListener("click", nextQuestion);
    document.getElementById("back-to-start-btn").addEventListener("click", backToStart);
  } catch (error) {
    showStartError(error.message || "問題データを読み込めませんでした。");
    document.getElementById("start-btn").disabled = true;
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", init);

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

  document.getElementById("question-meta").textContent =
    `第${question.exam}回　第${question.questionNumber}問`;

  document.getElementById("question-counter").textContent =
    `${state.currentIndex + 1} / ${state.questions.length}`;

  document.getElementById("question-text").textContent = question.question;

  const answerArea = document.getElementById("answer-area");
  answerArea.innerHTML = "";

  renderChoice(answerArea, question);
  restoreAnswer(question);

  const nextButton = document.getElementById("next-btn");
  nextButton.textContent =
    state.currentIndex === state.questions.length - 1
      ? "結果を見る"
      : "次へ";
}

// =======================
// 四択UI
// =======================
function renderChoice(area, question) {
  const container = document.createElement("div");
  container.className = "d-grid gap-3";

  question.displayChoices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-outline-light btn-lg choice-btn";
    button.dataset.choice = choice;
    button.setAttribute("aria-pressed", "false");

    const marker = document.createElement("span");
    marker.className = "choice-marker";
    marker.textContent = ["①", "②", "③", "④"][index];

    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = choice;

    button.append(marker, text);

    button.addEventListener("click", () => {
      state.answers[question.id] = choice;
      highlightChoice(container, choice);
    });

    container.appendChild(button);
  });

  area.appendChild(container);
}

function highlightChoice(container, selectedChoice) {
  [...container.children].forEach(button => {
    const selected = button.dataset.choice === selectedChoice;

    button.classList.toggle("btn-light", selected);
    button.classList.toggle("btn-outline-light", !selected);
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

  const container = document.querySelector("#answer-area > div");
  highlightChoice(container, answer);
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
  const table = document.getElementById("result-table");
  const cards = document.getElementById("result-cards");

  table.innerHTML = "";
  cards.innerHTML = "";

  state.questions.forEach((question, index) => {
    const answer = state.answers[question.id];
    const isCorrect = judge(question, answer);

    if (isCorrect) {
      correctCount += 1;
    }

    const userText = answer === undefined ? "未回答" : answer;
    const questionLabel = `第${question.exam}回　第${question.questionNumber}問`;

    // PC用
    const row = document.createElement("tr");

    appendCell(row, String(index + 1));

    const questionCell = document.createElement("td");
    const meta = document.createElement("div");
    meta.className = "result-question-meta";
    meta.textContent = questionLabel;

    const text = document.createElement("div");
    text.className = "result-question-text";
    text.textContent = question.question;

    questionCell.append(meta, text);
    row.appendChild(questionCell);

    appendCell(row, question.correct);
    appendCell(row, userText);

    const judgmentCell = document.createElement("td");
    judgmentCell.className = isCorrect ? "correct" : "incorrect";
    judgmentCell.textContent = isCorrect ? "○" : "×";
    row.appendChild(judgmentCell);

    table.appendChild(row);

    // スマホ用
    const card = document.createElement("div");
    card.className = "card bg-secondary mb-3";

    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    const heading = document.createElement("h3");
    heading.className = "h6 mb-2";
    heading.textContent = questionLabel;

    const questionText = document.createElement("p");
    questionText.className = "mb-3";
    questionText.textContent = question.question;

    const correctLine = createResultLine("正解", question.correct);
    const userLine = createResultLine("あなたの答え", userText);

    const judgmentLine = document.createElement("div");
    const judgmentLabel = document.createElement("strong");
    judgmentLabel.textContent = "判定：";

    const judgment = document.createElement("span");
    judgment.className = isCorrect ? "correct" : "incorrect";
    judgment.textContent = isCorrect ? "○" : "×";

    judgmentLine.append(judgmentLabel, judgment);
    cardBody.append(
      heading,
      questionText,
      correctLine,
      userLine,
      judgmentLine
    );
    card.appendChild(cardBody);
    cards.appendChild(card);
  });

  document.getElementById("score").textContent =
    `得点：${correctCount} / ${state.questions.length}`;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  row.appendChild(cell);
}

function createResultLine(labelText, value) {
  const line = document.createElement("div");
  line.className = "mb-1";

  const label = document.createElement("strong");
  label.textContent = `${labelText}：`;

  const text = document.createTextNode(value);
  line.append(label, text);

  return line;
}

// =======================
// エラー表示
// =======================
function showStartError(message) {
  const area = document.getElementById("start-error");
  area.textContent = message;
  area.classList.remove("d-none");
}

function clearStartError() {
  const area = document.getElementById("start-error");
  area.textContent = "";
  area.classList.add("d-none");
}

// =======================
// 画面切り替え
// =======================
function showScreen(id) {
  ["screen-start", "screen-quiz", "screen-result"].forEach(screenId => {
    document.getElementById(screenId).classList.add("d-none");
  });

  document.getElementById(id).classList.remove("d-none");
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

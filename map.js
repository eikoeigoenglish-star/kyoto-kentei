// =======================
// 京都検定2級 出題地図
// =======================
const PLACES_URL = "data/places.json";
const PLACES_FALLBACK = "places.sample.json";
const QUESTIONS_URL = "data/questions.json";
const STORAGE_KEY = "kk2-progress-v1";
const MAX_STREAK = 3;

const KYOTO_CENTER = [35.011, 135.768];

const state = {
  map: null,
  places: [],
  questionById: new Map(),
  progress: {},
  layer: null
};

// =======================
// 習得度（四択トレーニングと同じ規則）
// =======================
function stageOf(questionId) {
  const streak = state.progress[questionId];

  if (streak === undefined) return { key: "new", label: "未出題" };
  if (streak >= MAX_STREAK) return { key: "triple", label: "トリプル" };
  if (streak === 2) return { key: "double", label: "ダブル" };
  if (streak === 1) return { key: "hit", label: "ヒット" };
  return { key: "miss", label: "ミス" };
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn("進捗を読み込めませんでした", error);
    return {};
  }
}

// =======================
// 読み込み
// =======================
async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} の読込に失敗しました（HTTP ${response.status}）`);
  }

  return response.json();
}

async function loadPlaces() {
  try {
    return { places: await fetchJson(PLACES_URL), seeded: false };
  } catch (error) {
    // Wikidata をまだ流していない段階では仮データで動かす
    return { places: await fetchJson(PLACES_FALLBACK), seeded: true };
  }
}

async function init() {
  const status = document.getElementById("map-status");

  try {
    state.progress = loadProgress();

    const [{ places, seeded }, questions] = await Promise.all([
      loadPlaces(),
      fetchJson(QUESTIONS_URL)
    ]);

    state.places = places;
    questions.forEach(question => state.questionById.set(question.id, question));

    buildMap();
    render();

    const totalMentions = places.reduce((sum, place) => sum + place.count, 0);
    status.textContent = seeded
      ? `仮データ表示中：${places.length}地点／延べ${totalMentions}問。fetch と build を流すと全地点に増えます。`
      : `${places.length}地点／延べ${totalMentions}問`;

    document.getElementById("show-rare").addEventListener("change", render);
    document.getElementById("show-weak").addEventListener("change", render);
  } catch (error) {
    status.textContent = error.message || "地図データを読み込めませんでした。";
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", init);

// =======================
// 地図
// =======================
function buildMap() {
  state.map = L.map("map", {
    center: KYOTO_CENTER,
    zoom: 12,
    scrollWheelZoom: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>｜地点: Wikidata (CC0)',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(state.map);

  state.layer = L.layerGroup().addTo(state.map);
}

// 登場回数から球の見え方を決める。1回と12回で差が出すぎないよう平方根で圧縮。
function glowStyle(count) {
  const scale = Math.sqrt(count);

  return {
    size: Math.round(14 + scale * 9),      // 直径 px
    opacity: Math.min(0.35 + scale * 0.2, 1),
    duration: Math.max(4.2 - scale * 0.55, 1.4)  // 秒。多いほど速く脈打つ
  };
}

function hasUnlearned(place) {
  return place.questions.some(id => {
    const key = stageOf(id).key;
    return key !== "triple";
  });
}

function render() {
  const showRare = document.getElementById("show-rare").checked;
  const showWeak = document.getElementById("show-weak").checked;

  state.layer.clearLayers();

  const visible = state.places.filter(place => {
    if (!showRare && place.count < 2) return false;
    if (showWeak && !hasUnlearned(place)) return false;
    return true;
  });

  visible.forEach(place => {
    const { size, opacity, duration } = glowStyle(place.count);

    const html =
      `<span class="orb" style="--orb-size:${size}px;--orb-opacity:${opacity};--orb-duration:${duration}s"></span>` +
      (place.count >= 5 ? `<span class="orb-label">${escapeHtml(place.name)}</span>` : "");

    const marker = L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        className: "orb-icon",
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      }),
      title: `${place.name}（${place.count}問）`,
      keyboard: true,
      alt: `${place.name}、${place.count}問`
    });

    marker.bindPopup(() => popupHtml(place), {
      maxWidth: 340,
      className: "orb-popup"
    });

    marker.addTo(state.layer);
  });

  document.getElementById("map-status").dataset.visible = String(visible.length);
}

// =======================
// 吹き出し
// =======================
function popupHtml(place) {
  const rows = place.questions
    .map(id => state.questionById.get(id))
    .filter(Boolean)
    .map(question => {
      const stage = stageOf(question.id);

      return `
        <li class="pop-item">
          <p class="pop-meta">
            第${question.exam}回 第${question.questionNumber}問
            <span class="stage-tag stage-${stage.key}">${stage.label}</span>
          </p>
          <p class="pop-q">${escapeHtml(question.question)}</p>
          <p class="pop-a">${escapeHtml(question.correct)}</p>
        </li>`;
    })
    .join("");

  return `
    <div class="pop">
      <h2 class="pop-title">${escapeHtml(place.name)}</h2>
      <p class="pop-count">過去問11回分で ${place.count}問</p>
      <ol class="pop-list">${rows}</ol>
    </div>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

"use strict";

const STORES = ["H Mart", "Galleria", "Metro", "Food Basics", "Loblaws", "T&T"];
const CATEGORIES = ["전체", "라면·면", "음료", "정육·해산물", "과일·채소", "쌀·곡물", "냉동·간편식", "과자·간식", "소스·양념", "생활·하드웨어", "기타"];
const REGIONS = ["전체", "공통", "첫 지역만", "비교 지역만"];
const TONES = { "H Mart": "hmart", Galleria: "galleria", Metro: "metro", "Food Basics": "basics", Loblaws: "loblaws", "T&T": "tt" };

const state = {
  postal: "M5V 2T6",
  other: "",
  main: null,
  comparison: null,
  loading: true,
  error: "",
  category: "전체",
  store: "전체",
  query: "",
  region: "전체",
  selectedFlyer: null,
  visibleCount: 60,
  sample: true,
  controller: null,
};

const elements = {
  form: document.querySelector("#location-form"),
  postal: document.querySelector("#postal"),
  compare: document.querySelector("#compare"),
  sourceNote: document.querySelector("#source-note"),
  storeList: document.querySelector("#store-list"),
  flyerSummary: document.querySelector("#flyer-summary"),
  flyerVersions: document.querySelector("#flyer-versions"),
  dealCount: document.querySelector("#deal-count"),
  search: document.querySelector("#search"),
  clearSearch: document.querySelector("#clear-search"),
  categoryList: document.querySelector("#category-list"),
  regionTabs: document.querySelector("#region-tabs"),
  status: document.querySelector("#status"),
  dealGrid: document.querySelector("#deal-grid"),
  moreButton: document.querySelector("#more-button"),
};

const tidyPostal = (value) => value.toUpperCase().replace(/\s/g, "");
const validPostal = (value) => /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(tidyPostal(value));
const dealKey = (deal) => [deal.store, deal.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, ""), deal.price].join("|");
const formatDate = (value) => new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Toronto", month: "long", day: "numeric" }).format(new Date(value));
const formatUpdated = (value) => new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Toronto", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function identifyStore(value) {
  const name = value.trim().toLowerCase();
  if (name === "h mart" || name === "hmart") return "H Mart";
  if (name.includes("galleria")) return "Galleria";
  if (name === "metro") return "Metro";
  if (name === "food basics") return "Food Basics";
  if (name === "loblaws") return "Loblaws";
  if (name.startsWith("t&t")) return "T&T";
  return null;
}

function classify(name) {
  const value = name.toLowerCase();
  if (/ramen|ramyun|ramyeon|noodle|udon|pasta|spaghetti|vermicelli|soba|pho\b|짜장|라면|국수|우동/.test(value)) return "라면·면";
  if (/beverage|drink|juice|soda|cola|coffee|tea\b|water|milk|latte|beer|wine|kombucha|음료|주스|커피/.test(value)) return "음료";
  if (/beef|pork|chicken|meat|steak|bacon|sausage|fish|salmon|shrimp|prawn|seafood|crab|squid|lobster|lamb|tuna|고기|생선/.test(value)) return "정육·해산물";
  if (/apple|banana|grape|berry|orange|melon|mango|avocado|lettuce|spinach|tomato|potato|onion|carrot|pepper|cabbage|cucumber|fruit|vegetable|produce|딸기|사과|채소/.test(value)) return "과일·채소";
  if (/rice|grain|oat|cereal|quinoa|flour|콩|쌀|현미/.test(value)) return "쌀·곡물";
  if (/frozen|dumpling|pizza|meal|soup|kimchi|tofu|hot dog|nugget|만두|냉동|김치|두부/.test(value)) return "냉동·간편식";
  if (/chip|cookie|cracker|snack|chocolate|candy|biscuit|ice cream|popcorn|cake|pie|과자|초콜릿/.test(value)) return "과자·간식";
  if (/sauce|paste|seasoning|oil|vinegar|spice|dressing|syrup|고추장|간장|소스/.test(value)) return "소스·양념";
  if (/tool|hardware|battery|light bulb|cleaner|detergent|tissue|paper towel|toilet paper|soap|shampoo|pan|pot|storage|bag|kitchen|household|laundry|가전|세제|휴지/.test(value)) return "생활·하드웨어";
  return "기타";
}

async function loadFeed(postal, signal) {
  const cleanPostal = tidyPostal(postal);
  const base = "https://backflipp.wishabi.com/flipp";
  const response = await fetch(`${base}/flyers?locale=en-ca&postal_code=${encodeURIComponent(cleanPostal)}`, { signal });
  if (!response.ok) throw new Error("전단 목록 연결 실패");
  const listing = await response.json();
  const now = Date.now();
  const flyers = (listing.flyers || [])
    .filter((flyer) => identifyStore(flyer.merchant) && new Date(flyer.valid_from).getTime() <= now && new Date(flyer.valid_to).getTime() > now)
    .slice(0, 25);

  const results = await Promise.allSettled(flyers.map(async (flyer) => {
    const detailResponse = await fetch(`${base}/flyers/${flyer.id}?locale=en-ca&postal_code=${encodeURIComponent(cleanPostal)}`, { signal });
    if (!detailResponse.ok) throw new Error("전단 연결 실패");
    const detail = await detailResponse.json();
    const store = identifyStore(flyer.merchant);
    const items = (detail.items || [])
      .filter((item) => item.name?.trim() && item.price && !Number.isNaN(Number(item.price)) && (!item.valid_to || new Date(item.valid_to).getTime() > now))
      .map((item) => ({
        id: item.id,
        flyerId: flyer.id,
        store,
        name: item.name.trim(),
        price: String(item.price),
        discount: Number.isFinite(item.discount) ? item.discount : null,
        image: item.cutout_image_url?.replace(/^http:/, "https:") || null,
        validTo: item.valid_to || flyer.valid_to,
        updatedAt: flyer.updated_at || null,
        category: classify(item.name),
      }));
    return { flyer: { id: flyer.id, store, updatedAt: flyer.updated_at || null }, items };
  }));

  const completed = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  return {
    postal: cleanPostal,
    deals: completed.flatMap((result) => result.items),
    flyers: completed.map((result) => result.flyer),
    refreshedAt: listing.refreshed_at || null,
    errors: results.filter((result) => result.status === "rejected").map(() => "전단 연결 실패"),
  };
}

function getViewData() {
  const mainDeals = state.main?.deals || [];
  const comparisonDeals = state.comparison?.deals || [];
  const mainKeys = new Set(mainDeals.map(dealKey));
  const otherKeys = new Set(comparisonDeals.map(dealKey));
  const merged = [
    ...mainDeals.map((deal) => ({ ...deal, area: "main" })),
    ...comparisonDeals.filter((deal) => !mainKeys.has(dealKey(deal))).map((deal) => ({ ...deal, area: "other" })),
  ];
  const deals = merged.filter((deal) =>
    (state.category === "전체" || state.category === deal.category) &&
    (state.store === "전체" || state.store === deal.store) &&
    (state.selectedFlyer === null || deal.flyerId === state.selectedFlyer) &&
    deal.name.toLowerCase().includes(state.query.toLowerCase()) &&
    (state.region === "전체" ||
      (state.region === "공통" && otherKeys.has(dealKey(deal))) ||
      (state.region === "첫 지역만" && deal.area === "main" && !otherKeys.has(dealKey(deal))) ||
      (state.region === "비교 지역만" && deal.area === "other"))
  );
  const uniqueFlyers = [...new Map([...(state.main?.flyers || []), ...(state.comparison?.flyers || [])].map((flyer) => [flyer.id, flyer])).values()];
  return { merged, deals, otherKeys, uniqueFlyers };
}

function render() {
  const { merged, deals, otherKeys, uniqueFlyers } = getViewData();
  elements.sourceNote.textContent = `${state.sample ? "토론토 우편번호로 예시를 보여드리고 있어요. 내 우편번호를 입력해 주세요. " : ""}전단 적용 지점과 재고는 각 전단에서 확인해 주세요.`;
  elements.dealCount.textContent = state.loading ? "···" : String(deals.length);

  elements.storeList.innerHTML = ["전체", ...STORES].map((store) => {
    const count = store === "전체" ? STORES.length : merged.filter((deal) => deal.store === store).length;
    const pip = store === "전체" ? "" : `<i class="store-pip ${TONES[store]}"></i>`;
    return `<button type="button" data-store="${escapeHtml(store)}" class="${state.store === store ? "active" : ""}">${pip}${escapeHtml(store === "전체" ? "전체 마트" : store)}<span>${count}</span></button>`;
  }).join("");

  elements.categoryList.innerHTML = CATEGORIES.map((category) => {
    const count = category === "전체" ? merged.length : merged.filter((deal) => deal.category === category).length;
    return `<button type="button" data-category="${escapeHtml(category)}" class="${state.category === category ? "selected" : ""}">${escapeHtml(category)}<span>${count}</span></button>`;
  }).join("");

  if (state.main) {
    const warning = state.main.errors?.length ? "<small>일부 전단을 불러오지 못했어요.</small>" : "";
    elements.flyerSummary.innerHTML = `<strong>확인된 전단</strong><p>${state.main.flyers.length}개 · ${escapeHtml(state.main.postal)}</p>${state.comparison ? `<p>${state.comparison.flyers.length}개 · ${escapeHtml(state.comparison.postal)}</p>` : ""}${state.main.refreshedAt ? `<p>전단 목록 갱신 ${formatUpdated(state.main.refreshedAt)}</p>` : ""}${warning}`;
    const filteredFlyers = uniqueFlyers.filter((flyer) => state.store === "전체" || flyer.store === state.store);
    elements.flyerVersions.innerHTML = `<details class="flyer-versions"><summary>전단 버전별 보기</summary><button type="button" data-flyer="" class="${state.selectedFlyer === null ? "chosen" : ""}">모든 전단</button>${filteredFlyers.map((flyer) => `<button type="button" data-flyer="${flyer.id}" class="${state.selectedFlyer === flyer.id ? "chosen" : ""}"><span class="flyer-version-name">${escapeHtml(flyer.store)} · 전단 ${uniqueFlyers.filter((item) => item.store === flyer.store).findIndex((item) => item.id === flyer.id) + 1}</span>${flyer.updatedAt ? `<span class="flyer-version-date">업데이트 ${formatUpdated(flyer.updatedAt)}</span>` : ""}</button>`).join("")}<p>전단 번호는 지점명이 아닙니다. 적용 매장은 전단 원문에서 확인하세요.</p></details>`;
  } else {
    elements.flyerSummary.innerHTML = "<strong>확인된 전단</strong><p>불러오는 중</p>";
    elements.flyerVersions.innerHTML = "";
  }

  elements.regionTabs.hidden = !state.comparison;
  elements.regionTabs.innerHTML = state.comparison ? `<span>지역 비교</span>${REGIONS.map((region) => `<button type="button" data-region="${region}" class="${state.region === region ? "selected" : ""}">${region}</button>`).join("")}` : "";
  elements.clearSearch.hidden = !state.query;
  elements.status.innerHTML = state.error ? `<div class="state error" role="alert">${escapeHtml(state.error)}</div>` : "";

  if (state.loading) {
    elements.dealGrid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join("");
  } else if (deals.length) {
    elements.dealGrid.innerHTML = deals.slice(0, state.visibleCount).map((deal) => {
      const image = deal.image ? `<img src="${escapeHtml(deal.image)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : "<span>SALE</span>";
      const area = state.comparison ? `<span class="area-tag">${otherKeys.has(dealKey(deal)) ? "두 지역 공통" : deal.area === "main" ? escapeHtml(state.main.postal) : escapeHtml(state.comparison.postal)}</span>` : "";
      const discount = deal.discount && deal.discount > 0 ? `<span>${deal.discount}% 할인</span>` : "";
      return `<a class="deal-card" href="https://flipp.com/en-ca/flyer/${encodeURIComponent(deal.flyerId)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${deal.store} ${deal.name} 전단 원문 보기`)}"><div class="product-visual">${image}</div><div class="card-content"><div class="card-meta"><span class="store-tag ${TONES[deal.store]}">${escapeHtml(deal.store)}</span>${area}</div><h3>${escapeHtml(deal.name)}</h3><div class="price-row"><strong>${escapeHtml(deal.price.startsWith("$") ? deal.price : `$${deal.price}`)}</strong>${discount}</div><div class="expiry"><span>${deal.updatedAt ? `전단 업데이트 ${formatUpdated(deal.updatedAt)}` : "전단 업데이트 정보 없음"}</span><span>${formatDate(deal.validTo)}까지 · 원문 보기 ↗</span></div></div></a>`;
    }).join("");
  } else {
    elements.dealGrid.innerHTML = state.error ? "" : '<div class="state"><strong>해당 상품이 없어요.</strong><p>카테고리나 검색어를 바꾸거나 다른 우편번호를 입력해 보세요.</p></div>';
  }

  elements.moreButton.hidden = state.loading || deals.length <= state.visibleCount;
  elements.moreButton.innerHTML = `상품 더 보기 <span>${Math.min(state.visibleCount, deals.length)} / ${deals.length}</span>`;
}

async function refresh() {
  state.controller?.abort();
  state.controller = new AbortController();
  state.loading = true;
  state.error = "";
  state.main = null;
  state.comparison = null;
  state.selectedFlyer = null;
  render();
  try {
    const feeds = await Promise.all([state.postal, state.other].filter(Boolean).map((postal) => loadFeed(postal, state.controller.signal)));
    state.main = feeds[0];
    state.comparison = feeds[1] || null;
  } catch (error) {
    if (error.name !== "AbortError") state.error = error.message || "전단을 불러오지 못했어요.";
  } finally {
    state.loading = false;
    render();
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validPostal(elements.postal.value) || (elements.compare.value && !validPostal(elements.compare.value))) {
    state.error = "캐나다 우편번호를 입력해 주세요. 예: M5V 2T6";
    render();
    return;
  }
  state.postal = elements.postal.value.trim();
  state.other = elements.compare.value.trim();
  state.region = "전체";
  state.sample = false;
  localStorage.setItem("deal-postal", state.postal);
  refresh();
});

elements.storeList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-store]");
  if (!button) return;
  state.store = button.dataset.store;
  state.selectedFlyer = null;
  state.visibleCount = 60;
  render();
});

elements.categoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  state.visibleCount = 60;
  render();
});

elements.regionTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-region]");
  if (!button) return;
  state.region = button.dataset.region;
  state.visibleCount = 60;
  render();
});

elements.flyerVersions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-flyer]");
  if (!button) return;
  state.selectedFlyer = button.dataset.flyer ? Number(button.dataset.flyer) : null;
  state.visibleCount = 60;
  render();
});

elements.search.addEventListener("input", () => {
  state.query = elements.search.value;
  state.visibleCount = 60;
  render();
});

elements.clearSearch.addEventListener("click", () => {
  elements.search.value = "";
  state.query = "";
  render();
  elements.search.focus();
});

elements.moreButton.addEventListener("click", () => {
  state.visibleCount += 60;
  render();
});

const savedPostal = localStorage.getItem("deal-postal");
if (savedPostal && validPostal(savedPostal)) {
  state.postal = savedPostal;
  state.sample = false;
}
elements.postal.value = state.postal;
render();
refresh();

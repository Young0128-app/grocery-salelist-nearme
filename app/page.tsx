"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, MapPin, Search, SlidersHorizontal, X } from "lucide-react";

type Deal = { id: number; flyerId: number; store: string; name: string; price: string; discount: number | null; image: string | null; validTo: string; updatedAt: string | null; category: string };
type Feed = { postal: string; deals: Deal[]; flyers: { id: number; store: string; updatedAt: string | null }[]; refreshedAt: string | null; errors?: string[] };
const stores = ["H Mart", "Galleria", "Metro", "Food Basics", "Loblaws", "T&T"];
const categories = ["전체", "라면·면", "음료", "정육·해산물", "과일·채소", "쌀·곡물", "냉동·간편식", "과자·간식", "소스·양념", "생활·하드웨어", "기타"];
const tones: Record<string, string> = { "H Mart": "hmart", Galleria: "galleria", Metro: "metro", "Food Basics": "basics", Loblaws: "loblaws", "T&T": "tt" };
const tidy = (s: string) => s.toUpperCase().replace(/\s/g, "");
const valid = (s: string) => /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(tidy(s));
const key = (d: Deal) => [d.store, d.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, ""), d.price].join("|");
const date = (s: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Toronto", month: "long", day: "numeric" }).format(new Date(s));
const updated = (s: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Toronto", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(s));
const identify = (s: string) => { const n = s.trim().toLowerCase(); if (n === "h mart" || n === "hmart") return "H Mart"; if (n.includes("galleria")) return "Galleria"; if (n === "metro") return "Metro"; if (n === "food basics") return "Food Basics"; if (n === "loblaws") return "Loblaws"; if (n.startsWith("t&t")) return "T&T"; return null; };
function classify(name: string) { const s = name.toLowerCase(); if (/ramen|ramyun|ramyeon|noodle|udon|pasta|spaghetti|vermicelli|soba|pho\b|짜장|라면|국수|우동/.test(s)) return "라면·면"; if (/beverage|drink|juice|soda|cola|coffee|tea\b|water|milk|latte|beer|wine|kombucha|음료|주스|커피/.test(s)) return "음료"; if (/beef|pork|chicken|meat|steak|bacon|sausage|fish|salmon|shrimp|prawn|seafood|crab|squid|lobster|lamb|tuna|고기|생선/.test(s)) return "정육·해산물"; if (/apple|banana|grape|berry|orange|melon|mango|avocado|lettuce|spinach|tomato|potato|onion|carrot|pepper|cabbage|cucumber|fruit|vegetable|produce|딸기|사과|채소/.test(s)) return "과일·채소"; if (/rice|grain|oat|cereal|quinoa|flour|콩|쌀|현미/.test(s)) return "쌀·곡물"; if (/frozen|dumpling|pizza|meal|soup|kimchi|tofu|hot dog|nugget|만두|냉동|김치|두부/.test(s)) return "냉동·간편식"; if (/chip|cookie|cracker|snack|chocolate|candy|biscuit|ice cream|popcorn|cake|pie|과자|초콜릿/.test(s)) return "과자·간식"; if (/sauce|paste|seasoning|oil|vinegar|spice|dressing|syrup|고추장|간장|소스/.test(s)) return "소스·양념"; if (/tool|hardware|battery|light bulb|cleaner|detergent|tissue|paper towel|toilet paper|soap|shampoo|pan|pot|storage|bag|kitchen|household|laundry|가전|세제|휴지/.test(s)) return "생활·하드웨어"; return "기타"; }
type Flyer = { id: number; merchant: string; valid_from: string; valid_to: string; updated_at?: string };
type Item = { id: number; name: string; price: string; discount?: number; cutout_image_url?: string; valid_to?: string };
async function loadFeed(postal: string, signal: AbortSignal): Promise<Feed> {
  const p = tidy(postal), base = "https://backflipp.wishabi.com/flipp";
  const response = await fetch(`${base}/flyers?locale=en-ca&postal_code=${p}`, { signal });
  if (!response.ok) throw new Error("전단 목록 연결 실패");
  const listing = await response.json() as { flyers: Flyer[]; refreshed_at?: string };
  const now = Date.now();
  const flyers = (listing.flyers ?? []).filter(f => identify(f.merchant) && new Date(f.valid_from).getTime() <= now && new Date(f.valid_to).getTime() > now).slice(0,25);
  const results = await Promise.allSettled(flyers.map(async f => {
    const r = await fetch(`${base}/flyers/${f.id}?locale=en-ca&postal_code=${p}`, { signal });
    if (!r.ok) throw new Error("전단 연결 실패");
    const detail = await r.json() as { items: Item[] }; const store = identify(f.merchant)!;
    const items: Deal[] = (detail.items ?? []).filter(i => i.name?.trim() && i.price && !Number.isNaN(Number(i.price)) && (!i.valid_to || new Date(i.valid_to).getTime() > now)).map(i => ({ id: i.id, flyerId: f.id, store, name: i.name.trim(), price: i.price, discount: Number.isFinite(i.discount) ? i.discount! : null, image: i.cutout_image_url?.replace(/^http:/,"https:") ?? null, validTo: i.valid_to ?? f.valid_to, updatedAt: f.updated_at ?? null, category: classify(i.name) }));
    return { flyer: { id: f.id, store, updatedAt: f.updated_at ?? null }, items };
  }));
  const done = results.filter(r => r.status === "fulfilled").map(r => r.value);
  return { postal: p, deals: done.flatMap(r => r.items), flyers: done.map(r => r.flyer), refreshedAt: listing.refreshed_at ?? null, errors: results.filter(r => r.status === "rejected").map(() => "전단 연결 실패") };
}

export default function Home() {
  const [postal, setPostal] = useState("M5V 2T6");
  const [draft, setDraft] = useState("M5V 2T6");
  const [other, setOther] = useState("");
  const [otherDraft, setOtherDraft] = useState("");
  const [main, setMain] = useState<Feed | null>(null);
  const [comparison, setComparison] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("전체");
  const [store, setStore] = useState("전체");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [selectedFlyer, setSelectedFlyer] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [sample, setSample] = useState(true);

  useEffect(() => { const saved = localStorage.getItem("deal-postal"); if (saved && valid(saved)) { setPostal(saved); setDraft(saved); setSample(false); } }, []);
  useEffect(() => setVisibleCount(60), [category, store, query, region, selectedFlyer, main, comparison]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setMain(null); setComparison(null); setSelectedFlyer(null);
    Promise.all([postal, other].filter(Boolean).map(p => loadFeed(p, controller.signal))).then(([a, b]) => { setMain(a); setComparison(b ?? null); setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [postal, other]);

  const mainKeys = useMemo(() => new Set(main?.deals.map(key)), [main]);
  const otherKeys = useMemo(() => new Set(comparison?.deals.map(key)), [comparison]);
  const uniqueFlyers = useMemo(() => [...new Map([...(main?.flyers ?? []), ...(comparison?.flyers ?? [])].map(f => [f.id, f])).values()], [main, comparison]);
  const merged = useMemo(() => [...(main?.deals ?? []).map(d => ({ ...d, area: "main" })), ...(comparison?.deals ?? []).filter(d => !mainKeys.has(key(d))).map(d => ({ ...d, area: "other" }))], [main, comparison, mainKeys]);
  const deals = useMemo(() => merged.filter(d =>
    (category === "전체" || category === d.category) &&
    (store === "전체" || store === d.store) &&
    (selectedFlyer === null || d.flyerId === selectedFlyer) &&
    d.name.toLowerCase().includes(query.toLowerCase()) &&
    (region === "전체" || (region === "공통" && otherKeys.has(key(d))) ||
      (region === "첫 지역만" && d.area === "main" && !otherKeys.has(key(d))) ||
      (region === "비교 지역만" && d.area === "other"))
  ), [merged, otherKeys, category, store, selectedFlyer, query, region]);
  const count = (c: string) => c === "전체" ? merged.length : merged.filter(d => d.category === c).length;
  function submit(e: React.FormEvent) { e.preventDefault(); if (!valid(draft) || (otherDraft && !valid(otherDraft))) { setError("캐나다 우편번호를 입력해 주세요. 예: M5V 2T6"); return; } setPostal(draft.trim()); setOther(otherDraft.trim()); setRegion("전체"); setSample(false); localStorage.setItem("deal-postal", draft.trim()); }

  return <main className="shell"><header className="masthead"><div className="brand"><span className="brand-symbol">%</span><span>동네세일<span className="brand-dot">.</span></span></div><span className="masthead-note">우리 동네 마트 전단을 한눈에</span><span className="live-label"><i/>전단 기준</span></header>
    <div className="page-container"><section className="intro-row"><div><p className="eyebrow">NEARBY DEALS · CANADA</p><h1>오늘 뭐가 세일할까?</h1><p className="intro-copy">우편번호를 입력하면 6개 마트의 전단 상품을 카테고리별로 모아 보여드려요.</p></div><div className="intro-stamp">6<span>개 마트</span></div></section>
      <form className="location-bar" onSubmit={submit}><div className="location-field"><label htmlFor="postal"><MapPin size={17}/> 내 주변 우편번호</label><input id="postal" value={draft} onChange={e => setDraft(e.target.value)} placeholder="예: M5V 2T6" maxLength={7}/></div><div className="compare-field"><label htmlFor="compare">다른 지역과 비교 <span>선택</span></label><input id="compare" value={otherDraft} onChange={e => setOtherDraft(e.target.value)} placeholder="다른 우편번호" maxLength={7}/></div><button className="fetch-button" type="submit">세일 보기 <ArrowUpRight size={18}/></button></form>
      <div className="source-line"><span>{sample ? "토론토 우편번호로 예시를 보여드리고 있어요. 내 우편번호를 입력해 주세요. " : ""}전단 적용 지점과 재고는 각 전단에서 확인해 주세요.</span><a href="https://flipp.com" target="_blank" rel="noopener noreferrer">자료: Flipp <ArrowUpRight size={13}/></a></div>
      <section className="workspace"><aside className="filters">
        <div className="filter-heading"><SlidersHorizontal size={17}/><strong>마트 고르기</strong></div>
        <div className="store-list"><button className={store === "전체" ? "active" : ""} onClick={() => { setStore("전체"); setSelectedFlyer(null); }}>전체 마트 <span>{stores.length}</span></button>{stores.map(s => <button key={s} className={store === s ? "active" : ""} onClick={() => { setStore(s); setSelectedFlyer(null); }}><i className={"store-pip " + tones[s]}/>{s}<span>{merged.filter(d => d.store === s).length}</span></button>)}</div>
        <div className="flyer-summary"><strong>확인된 전단</strong><p>{main ? `${main.flyers.length}개 · ${main.postal}` : "불러오는 중"}</p>{comparison && <p>{comparison.flyers.length}개 · {comparison.postal}</p>}{main?.refreshedAt && <p>전단 목록 갱신 {updated(main.refreshedAt)}</p>}{main?.errors?.length ? <small>일부 전단을 불러오지 못했어요.</small> : null}</div>
        {main && <details className="flyer-versions"><summary>전단 버전별 보기</summary><button className={selectedFlyer === null ? "chosen" : ""} onClick={() => setSelectedFlyer(null)}>모든 전단</button>{uniqueFlyers.filter(f => store === "전체" || f.store === store).map(f => <button key={f.id} className={selectedFlyer === f.id ? "chosen" : ""} onClick={() => setSelectedFlyer(f.id)}><span className="flyer-version-name">{f.store} · 전단 {uniqueFlyers.filter(v => v.store === f.store).findIndex(v => v.id === f.id) + 1}</span>{f.updatedAt && <span className="flyer-version-date">업데이트 {updated(f.updatedAt)}</span>}</button>)}<p>전단 번호는 지점명이 아닙니다. 적용 매장은 전단 원문에서 확인하세요.</p></details>}
      </aside>
        <div className="results"><div className="results-top"><div><p className="eyebrow">THIS WEEK&apos;S FLYERS</p><h2>이번 주 세일 <span>{loading ? "···" : deals.length}</span></h2></div><div className="search-box"><Search size={18}/><input aria-label="상품 검색" placeholder="상품명 검색" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="검색 지우기" onClick={() => setQuery("")}><X size={16}/></button>}</div></div>
          <div className="category-scroll" aria-label="상품 카테고리">{categories.map(c => <button className={category === c ? "selected" : ""} key={c} onClick={() => setCategory(c)}>{c}<span>{count(c)}</span></button>)}</div>
          {comparison && <div className="region-tabs"><span>지역 비교</span>{["전체", "공통", "첫 지역만", "비교 지역만"].map(r => <button key={r} className={region === r ? "selected" : ""} onClick={() => setRegion(r)}>{r}</button>)}</div>}
          {error && <div className="state error" role="alert">{error}</div>}
          {loading ? <div className="deal-grid" aria-live="polite">{Array.from({length:6}).map((_, i) => <div className="skeleton" key={i}/>)}</div> : deals.length ? <>
            <div className="deal-grid">{deals.slice(0,visibleCount).map((d, i) =>
              <a className="deal-card" key={`${d.area}-${d.id}-${i}`} href={`https://flipp.com/en-ca/flyer/${d.flyerId}`} target="_blank" rel="noopener noreferrer" aria-label={`${d.store} ${d.name} 전단 원문 보기`}>
                <div className="product-visual">{d.image ? <img src={d.image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }}/> : <span>SALE</span>}</div>
                <div className="card-content"><div className="card-meta"><span className={"store-tag " + tones[d.store]}>{d.store}</span>{comparison && <span className="area-tag">{otherKeys.has(key(d)) ? "두 지역 공통" : d.area === "main" ? main?.postal : comparison.postal}</span>}</div>
                  <h3>{d.name}</h3><div className="price-row"><strong>{d.price.startsWith("$") ? d.price : `$${d.price}`}</strong>{d.discount && d.discount > 0 ? <span>{d.discount}% 할인</span> : null}</div>
                  <div className="expiry"><span>{d.updatedAt ? `전단 업데이트 ${updated(d.updatedAt)}` : "전단 업데이트 정보 없음"}</span><span>{date(d.validTo)}까지 · 원문 보기 <ArrowUpRight size={14}/></span></div>
                </div>
              </a>
            )}</div>{deals.length > visibleCount && <button className="more-button" onClick={() => setVisibleCount(c => c + 60)}>상품 더 보기 <span>{Math.min(visibleCount,deals.length)} / {deals.length}</span></button>}
          </> : !error && <div className="state"><strong>해당 상품이 없어요.</strong><p>카테고리나 검색어를 바꾸거나 다른 우편번호를 입력해 보세요.</p></div>}
          <div className="disclosure">업데이트 시각은 토론토 현지시간 기준입니다. 상품과 가격은 전단 제공처의 업데이트에 따라 바뀔 수 있습니다. 같은 체인도 지점별 행사와 재고가 다를 수 있으니 구매 전 전단 원문에서 매장을 확인해 주세요. 지역 비교의 ‘공통’은 상품명과 표시 가격이 같은 경우입니다.</div>
        </div></section></div></main>;
}

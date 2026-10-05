"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Leaflet ใช้ window จึงต้องโหลดฝั่งเบราว์เซอร์เท่านั้น
const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="map-loading">กำลังโหลดแผนที่...</div>,
});

const STYLE_OPTIONS = ["คาเฟ่", "ธรรมชาติ", "วัฒนธรรม", "ของกิน", "ช้อปปิ้ง"];

const CATEGORY_LABEL = {
  cafe: "☕ คาเฟ่",
  nature: "🌿 ธรรมชาติ",
  culture: "🏛 วัฒนธรรม",
  food: "🍜 ของกิน",
  shopping: "🛍 ช้อปปิ้ง",
  other: "📍 อื่นๆ",
};

const INCIDENT_OPTIONS = [
  { type: "rain", label: "🌧 ฝนตก" },
  { type: "closed", label: "🚫 ร้านปิด" },
  { type: "tired", label: "😮‍💨 เหนื่อยแล้ว" },
  { type: "other", label: "✏️ อื่นๆ (พิมพ์เอง)" },
];

const pad = (n) => String(n).padStart(2, "0");
function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const baht = (n) => Number(n || 0).toLocaleString("th-TH");

export default function HomePage() {
  // ---------- ฟอร์ม ----------
  const [form, setForm] = useState({
    destination: "",
    days: 2,
    budget: 3000,
    styles: ["คาเฟ่", "ธรรมชาติ"],
    startTime: "09:00",
  });

  // ---------- แผน ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [activeDay, setActiveDay] = useState(0);
  const [completedIds, setCompletedIds] = useState([]);
  const [highlightIds, setHighlightIds] = useState([]);
  const [focus, setFocus] = useState(null);
  const highlightTimer = useRef(null);
  const mapRef = useRef(null);

  // ---------- ปรับแผนด่วน ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("rain");
  const [detail, setDetail] = useState("");
  const [closedId, setClosedId] = useState("");
  const [replanTime, setReplanTime] = useState("12:00");
  const [replanLoading, setReplanLoading] = useState(false);
  const [replanError, setReplanError] = useState("");

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const day = plan?.days?.[activeDay] || null;
  const slots = day?.slots || [];
  const remainingSlots = slots.filter((s) => !completedIds.includes(s.id));
  const dayTotal = slots.reduce((sum, s) => sum + s.costEstimate, 0);
  const tripTotal = useMemo(
    () => (plan ? plan.days.reduce((t, d) => t + d.slots.reduce((s, x) => s + x.costEstimate, 0), 0) : 0),
    [plan]
  );

  function updateForm(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleStyle(s) {
    setForm((f) => ({
      ...f,
      styles: f.styles.includes(s) ? f.styles.filter((x) => x !== s) : [...f.styles, s],
    }));
  }

  // ---------- สร้างแผน ----------
  async function handleCreatePlan(e) {
    if (e) e.preventDefault();
    if (loading) return;
    if (!form.destination.trim()) {
      setError("กรุณาระบุปลายทาง");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: form.destination,
          days: Number(form.days),
          budget: Number(form.budget),
          styles: form.styles,
          startTime: form.startTime,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างแผนไม่สำเร็จ กรุณาลองใหม่");
      setPlan(data);
      setActiveDay(0);
      setCompletedIds([]);
      setHighlightIds([]);
      setFocus(null);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  function toggleComplete(id) {
    setCompletedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function focusSlot(id) {
    setFocus((f) => ({ id, n: (f?.n || 0) + 1 }));
    // บนมือถือแผนที่อยู่ด้านบน เลื่อนไปให้เห็น
    if (window.innerWidth < 900) {
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ---------- ปรับแผนด่วน ----------
  function openReplan() {
    setReplanTime(nowHHMM());
    setIncidentType("rain");
    setDetail("");
    setClosedId(remainingSlots[0]?.id || "");
    setReplanError("");
    setModalOpen(true);
  }

  function closeReplan() {
    if (!replanLoading) setModalOpen(false);
  }

  async function submitReplan() {
    if (replanLoading || !day) return;
    if (incidentType === "other" && !detail.trim()) {
      setReplanError("กรุณาพิมพ์รายละเอียดเหตุการณ์");
      return;
    }
    const closedSlot = slots.find((s) => s.id === closedId);
    if (incidentType === "closed" && !closedSlot) {
      setReplanError("กรุณาเลือกสถานที่ที่ปิด");
      return;
    }

    // จุดล่าสุดของผู้ใช้ = slot ที่ไปแล้วที่ตรงกับเวลาล่าสุด ถ้ายังไม่ได้ไปไหนใช้จุดแรกของวัน
    const done = slots.filter((s) => completedIds.includes(s.id));
    const last = done.length ? done[done.length - 1] : slots[0];

    setReplanLoading(true);
    setReplanError("");
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: form.destination,
          budget: Number(form.budget),
          dayNumber: day.day,
          currentTime: replanTime,
          currentPlan: day,
          completedSlotIds: done.map((s) => s.id),
          incident: { type: incidentType, detail: detail.trim() },
          closedPlaceName: incidentType === "closed" ? closedSlot.place : "",
          currentLocation: { lat: last.lat, lng: last.lng },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ปรับแผนไม่สำเร็จ กรุณาลองใหม่");

      // แทนที่เฉพาะวันนี้ (slot ที่ไปแล้วถูกเก็บไว้เหมือนเดิมโดยเซิร์ฟเวอร์)
      setPlan((p) => ({ ...p, days: p.days.map((d, i) => (i === activeDay ? data.day : d)) }));
      setCompletedIds((ids) => ids.filter((id) => data.day.slots.some((s) => s.id === id)));
      setHighlightIds(data.newSlotIds || []);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightIds([]), 8000);
      setModalOpen(false);
    } catch (err) {
      setReplanError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setReplanLoading(false);
    }
  }

  return (
    <main className="container">
      <style>{css}</style>

      <header className="header">
        <h1>🗺️ AI Local Travel &amp; Itinerary Planner</h1>
        <p>บอกความต้องการ แล้วให้ AI วางแผนทริปให้ — ฝนตกหรือร้านปิดก็ปรับแผนได้ทันที</p>
      </header>

      {/* ---------- ก) ฟอร์ม ---------- */}
      <form className="card" onSubmit={handleCreatePlan}>
        <div className="grid-form">
          <label className="field wide">
            <span>ปลายทาง</span>
            <input
              type="text"
              value={form.destination}
              onChange={(e) => updateForm("destination", e.target.value)}
              placeholder="เช่น เชียงใหม่, ภูเก็ต, โตเกียว"
              maxLength={100}
            />
          </label>

          <label className="field">
            <span>จำนวนวัน</span>
            <select value={form.days} onChange={(e) => updateForm("days", e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} วัน
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>งบรวมต่อคน (บาท)</span>
            <input
              type="number"
              inputMode="numeric"
              min={100}
              step={100}
              value={form.budget}
              onChange={(e) => updateForm("budget", e.target.value)}
            />
          </label>

          <label className="field">
            <span>เวลาเริ่มเที่ยว</span>
            <input type="time" value={form.startTime} onChange={(e) => updateForm("startTime", e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span>สไตล์การเที่ยว</span>
          <div className="chips">
            {STYLE_OPTIONS.map((s) => (
              <button
                type="button"
                key={s}
                className={`chip ${form.styles.includes(s) ? "on" : ""}`}
                aria-pressed={form.styles.includes(s)}
                onClick={() => toggleStyle(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn primary big" disabled={loading}>
          {loading ? "กำลังวางแผน..." : plan ? "สร้างแผนใหม่" : "สร้างแผน"}
        </button>

        {error && (
          <div className="alert" role="alert">
            <span>⚠️ {error}</span>
            <button type="button" className="btn small" onClick={() => handleCreatePlan()} disabled={loading}>
              ลองอีกครั้ง
            </button>
          </div>
        )}
      </form>

      {/* ---------- ข) รายการแผน + ค) แผนที่ ---------- */}
      {plan && day && (
        <section className="result">
          <div className="map-col" ref={mapRef}>
            <div className="map-box">
              <MapView slots={slots} focus={focus} completedIds={completedIds} highlightIds={highlightIds} />
            </div>
          </div>

          <div className="list-col">
            <h2 className="trip-title">{plan.title}</h2>
            <p className="muted">
              รวมทั้งทริปประมาณ <strong>{baht(tripTotal)}</strong> บาท/คน (งบ {baht(plan.budget)} บาท)
            </p>
            {plan.overBudget && (
              <div className="warn">⚠️ แผนนี้ประมาณการเกินงบเล็กน้อย ลองกด "สร้างแผนใหม่" หรือเพิ่มงบ</div>
            )}

            <div className="tabs" role="tablist">
              {plan.days.map((d, i) => (
                <button
                  key={d.day}
                  role="tab"
                  aria-selected={i === activeDay}
                  className={`tab ${i === activeDay ? "on" : ""}`}
                  onClick={() => {
                    setActiveDay(i);
                    setFocus(null);
                  }}
                >
                  วัน {d.day}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn urgent"
              onClick={openReplan}
              disabled={remainingSlots.length === 0 || replanLoading}
            >
              {replanLoading ? "กำลังปรับแผน..." : "⚡ ปรับแผนด่วน"}
            </button>
            <p className="hint">ติ๊ก ✅ จุดที่ไปแล้ว ก่อนกดปรับแผน ระบบจะไม่แตะจุดเหล่านั้น</p>

            <ol className="slots">
              {slots.map((s, i) => {
                const done = completedIds.includes(s.id);
                const isNew = highlightIds.includes(s.id);
                return (
                  <li key={s.id} className={`slot ${done ? "done" : ""} ${isNew ? "new" : ""}`}>
                    <button
                      type="button"
                      className="check"
                      aria-pressed={done}
                      aria-label={done ? `ยกเลิกว่าไป ${s.place} แล้ว` : `ทำเครื่องหมายว่าไป ${s.place} แล้ว`}
                      onClick={() => toggleComplete(s.id)}
                    >
                      {done ? "✅" : "⬜"}
                    </button>
                    <div
                      className="slot-body"
                      role="button"
                      tabIndex={0}
                      onClick={() => focusSlot(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focusSlot(s.id);
                        }
                      }}
                    >
                      <div className="slot-time">
                        <span className="num">{i + 1}</span> {s.start} - {s.end}
                        {isNew && <span className="badge">ใหม่</span>}
                      </div>
                      <div className="slot-place">{s.place}</div>
                      <div className="slot-meta">
                        <span>{CATEGORY_LABEL[s.category] || CATEGORY_LABEL.other}</span>
                        <span>{s.indoor ? "🏠 ในร่ม" : "🌳 กลางแจ้ง"}</span>
                        <span>💰 ~{baht(s.costEstimate)} บาท</span>
                      </div>
                      {s.note && <div className="slot-note">{s.note}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="muted">รวมวันนี้ประมาณ {baht(dayTotal)} บาท/คน</p>
            <p className="disclaimer">
              ข้อมูลสถานที่และพิกัดมาจาก AI อาจคลาดเคลื่อน หรือร้านอาจปิดไปแล้ว ควรตรวจสอบก่อนเดินทางจริง
            </p>
          </div>
        </section>
      )}

      {/* ---------- หน้าต่างปรับแผนด่วน ---------- */}
      {modalOpen && (
        <div className="overlay" onClick={closeReplan}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="ปรับแผนด่วน" onClick={(e) => e.stopPropagation()}>
            <h3>⚡ เกิดอะไรขึ้น?</h3>
            <p className="muted">
              ไปแล้ว {slots.length - remainingSlots.length} จุด · เหลือ {remainingSlots.length} จุดที่จะถูกปรับ
            </p>

            <div className="incidents">
              {INCIDENT_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.type}
                  className={`incident ${incidentType === o.type ? "on" : ""}`}
                  aria-pressed={incidentType === o.type}
                  onClick={() => setIncidentType(o.type)}
                  disabled={replanLoading}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {incidentType === "closed" && (
              <label className="field">
                <span>สถานที่ที่ปิด</span>
                <select value={closedId} onChange={(e) => setClosedId(e.target.value)} disabled={replanLoading}>
                  {remainingSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.start} · {s.place}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field">
              <span>{incidentType === "other" ? "รายละเอียดเหตุการณ์" : "รายละเอียดเพิ่มเติม (ไม่บังคับ)"}</span>
              <textarea
                rows={2}
                maxLength={300}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={incidentType === "other" ? "เช่น รถติดมาก ไปไม่ทัน / อยากกินข้าวก่อน" : "เช่น ฝนตกหนักมาก"}
                disabled={replanLoading}
              />
            </label>

            <label className="field">
              <span>เวลาตอนนี้ (แก้ได้ เพื่อใช้สาธิต)</span>
              <input type="time" value={replanTime} onChange={(e) => setReplanTime(e.target.value)} disabled={replanLoading} />
            </label>

            {replanError && (
              <div className="alert" role="alert">
                ⚠️ {replanError}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn" onClick={closeReplan} disabled={replanLoading}>
                ยกเลิก
              </button>
              <button type="button" className="btn urgent" onClick={submitReplan} disabled={replanLoading}>
                {replanLoading ? "กำลังปรับแผน..." : "ปรับแผนเลย"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const css = `
  * { box-sizing: border-box; }
  body { background: #f5f7fb; color: #1f2937; line-height: 1.5; }
  .container { max-width: 1200px; margin: 0 auto; padding: 16px; }
  .header h1 { font-size: 1.5rem; margin: 8px 0 4px; }
  .header p { margin: 0 0 16px; color: #4b5563; }
  .card { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08); display: flex; flex-direction: column; gap: 14px; }
  .grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; font-size: 1rem; }
  .field > span { font-weight: 600; font-size: .95rem; }
  .field.wide { grid-column: 1 / -1; }
  input, select, textarea { font: inherit; font-size: 1rem; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; min-height: 46px; width: 100%; }
  textarea { resize: vertical; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { font: inherit; padding: 10px 16px; min-height: 44px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  .chip.on { background: #2563eb; color: #fff; border-color: #2563eb; }
  .btn { font: inherit; font-weight: 600; padding: 12px 18px; min-height: 48px; border-radius: 12px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  .btn.small { min-height: 40px; padding: 8px 14px; }
  .btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  .btn.big { font-size: 1.1rem; min-height: 52px; }
  .btn.urgent { background: #f97316; border-color: #f97316; color: #fff; width: 100%; font-size: 1.1rem; }
  .btn:disabled { opacity: .55; cursor: not-allowed; }
  .alert { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 12px; }
  .warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
  .muted { color: #4b5563; margin: 4px 0; }
  .hint { color: #6b7280; font-size: .9rem; margin: 6px 0 12px; }
  .disclaimer { color: #6b7280; font-size: .85rem; }
  .result { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
  .map-box { height: 320px; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.12); background: #e5e7eb; }
  .map-loading { height: 100%; display: flex; align-items: center; justify-content: center; color: #6b7280; }
  .list-col { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .trip-title { font-size: 1.25rem; margin: 0; }
  .tabs { display: flex; gap: 8px; overflow-x: auto; margin: 12px 0; padding-bottom: 4px; }
  .tab { font: inherit; font-weight: 600; padding: 10px 18px; min-height: 44px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; white-space: nowrap; }
  .tab.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
  .slots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .slot { display: flex; gap: 8px; align-items: stretch; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; background: #fff; transition: background .4s, border-color .4s; }
  .slot.done { background: #f3f4f6; }
  .slot.done .slot-place { text-decoration: line-through; color: #6b7280; }
  .slot.new { background: #fff7ed; border-color: #f97316; }
  .check { font-size: 1.5rem; background: none; border: none; cursor: pointer; min-width: 48px; min-height: 48px; border-radius: 10px; }
  .slot-body { flex: 1; cursor: pointer; padding: 4px 6px; border-radius: 10px; }
  .slot-body:focus-visible { outline: 2px solid #2563eb; }
  .slot-time { font-weight: 600; color: #1d4ed8; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .num { display: inline-flex; width: 24px; height: 24px; border-radius: 50%; background: #2563eb; color: #fff; align-items: center; justify-content: center; font-size: .85rem; }
  .badge { background: #f97316; color: #fff; font-size: .75rem; padding: 2px 8px; border-radius: 999px; }
  .slot-place { font-size: 1.1rem; font-weight: 700; margin: 2px 0; }
  .slot-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .9rem; color: #374151; }
  .slot-note { margin-top: 4px; font-size: .95rem; color: #4b5563; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; padding: 0; z-index: 1000; }
  .modal { background: #fff; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .modal h3 { margin: 0; font-size: 1.25rem; }
  .incidents { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .incident { font: inherit; padding: 14px 8px; min-height: 52px; border-radius: 12px; border: 2px solid #e5e7eb; background: #fff; cursor: pointer; }
  .incident.on { border-color: #f97316; background: #fff7ed; font-weight: 700; }
  .modal-actions { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; }
  @media (min-width: 900px) {
    .container { padding: 24px; }
    .grid-form { grid-template-columns: 2fr 1fr 1fr 1fr; }
    .field.wide { grid-column: auto; }
    .result { grid-template-columns: 440px 1fr; align-items: start; }
    .map-col { grid-column: 2; grid-row: 1; position: sticky; top: 16px; }
    .list-col { grid-column: 1; grid-row: 1; }
    .map-box { height: calc(100vh - 32px); max-height: 720px; }
    .overlay { align-items: center; padding: 16px; }
    .modal { border-radius: 18px; }
  }
`;

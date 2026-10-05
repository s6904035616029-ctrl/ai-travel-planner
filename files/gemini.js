// ตัวช่วยกลางที่ใช้ร่วมกันระหว่าง /api/plan และ /api/replan (ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น)

export const CATEGORIES = ["cafe", "nature", "culture", "food", "shopping", "other"];

// ---------- JSON Schema ที่บังคับให้ Gemini ตอบ ----------
export const slotSchema = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING" },
    start: { type: "STRING" },
    end: { type: "STRING" },
    place: { type: "STRING" },
    category: { type: "STRING", enum: CATEGORIES },
    lat: { type: "NUMBER" },
    lng: { type: "NUMBER" },
    costEstimate: { type: "NUMBER" },
    indoor: { type: "BOOLEAN" },
    note: { type: "STRING" },
  },
  required: [
    "id", "start", "end", "place", "category",
    "lat", "lng", "costEstimate", "indoor", "note",
  ],
};

export const daySchema = {
  type: "OBJECT",
  properties: {
    day: { type: "INTEGER" },
    slots: { type: "ARRAY", items: slotSchema },
  },
  required: ["day", "slots"],
};

export const planSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    days: { type: "ARRAY", items: daySchema },
    totalCostEstimate: { type: "NUMBER" },
  },
  required: ["title", "days", "totalCostEstimate"],
};

// ---------- เวลา ----------
// รับ "9:00" หรือ "09:00" แล้วคืน "09:00" ถ้าไม่ถูกต้องคืน null
export function fixTime(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ---------- ทำความสะอาด slot ที่ AI ตอบมา ----------
// ตัด slot ที่ข้อมูลไม่ครบ/พิกัดผิดทิ้ง เรียงตามเวลา และตั้ง id ใหม่เองเสมอ (ไม่เชื่อ id จาก AI)
export function normalizeSlots(raw, makeId) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const place = String(s.place ?? "").trim();
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    const start = fixTime(s.start);
    const end = fixTime(s.end);
    if (!place || !start || !end) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({
      id: "",
      start,
      end,
      place: place.slice(0, 120),
      category: CATEGORIES.includes(s.category) ? s.category : "other",
      lat,
      lng,
      costEstimate: Math.max(0, Math.round(Number(s.costEstimate) || 0)),
      indoor: Boolean(s.indoor),
      note: String(s.note ?? "").slice(0, 300),
    });
  }
  out.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  return out.map((s, i) => ({ ...s, id: makeId(i) }));
}

// ---------- เรียก Gemini REST API ----------
export async function callGemini({ systemInstruction, userPrompt, schema }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) {
    const err = new Error("Missing GEMINI_API_KEY or GEMINI_MODEL");
    err.code = "CONFIG";
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey, // ส่งทาง header ไม่ใส่ใน URL
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // log รายละเอียดไว้ฝั่งเซิร์ฟเวอร์ (ดูได้ใน Vercel Logs) ไม่ส่งกลับไปให้ผู้ใช้
      const detail = await res.text().catch(() => "");
      console.error("Gemini API error", res.status, detail.slice(0, 500));
      throw new Error(`Gemini HTTP ${res.status}`);
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p?.text ?? "").join("").trim();
    if (!text) throw new Error("Gemini returned empty text");

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(cleaned);
  } finally {
    clearTimeout(timer);
  }
}

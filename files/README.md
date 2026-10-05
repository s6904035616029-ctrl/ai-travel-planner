# AI Local Travel & Itinerary Planner

เว็บวางแผนทริปท่องเที่ยวด้วย AI (Gemini) พร้อมแผนที่ Leaflet และปุ่ม "ปรับแผนด่วน"
เมื่อฝนตกหรือร้านปิด สร้างด้วย Next.js (App Router, JavaScript) และ deploy บน Vercel

## Tech stack

- Next.js 15 (App Router) + React 19
- Leaflet + react-leaflet v5 (v5 ต้องใช้คู่กับ React 19; ถ้าลดเป็น React 18 ต้องใช้ react-leaflet v4)
- Gemini API (เรียกผ่าน API Route ฝั่งเซิร์ฟเวอร์)

## Environment Variables

ตั้งใน Vercel: Settings > Environment Variables (หรือไฟล์ `.env.local` ถ้ารันในเครื่อง)

| Key | ความหมาย |
|---|---|
| `GEMINI_API_KEY` | API Key จาก Google AI Studio |
| `GEMINI_MODEL` | ชื่อโมเดล เช่น `gemini-2.5-flash` (เช็กชื่อล่าสุดใน AI Studio) |

> ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น **ห้ามใส่ prefix `NEXT_PUBLIC_`** เพราะจะทำให้ Key
> ถูกฝังลงโค้ดฝั่งเบราว์เซอร์และหลุดได้ และห้าม commit `.env.local` ลง GitHub
> หลังเปลี่ยนค่าใน Vercel ต้อง Redeploy จึงจะมีผล

## ข้อควรรู้ของ Next.js เวอร์ชันใหม่

### 1) params ของ Dynamic Route เป็น Promise

ถ้าสร้างหน้าแบบ Dynamic Route (เช่น `app/trip/[id]/page.js`) ใน Next.js เวอร์ชันใหม่
`params` เป็น Promise ต้อง unwrap ก่อนใช้งานเสมอ

```js
"use client";
import { use } from "react";

export default function TripPage({ params }) {
  const { id } = use(params); // ห้ามเขียน const { id } = params ตรงๆ
  return <div>Trip {id}</div>;
}
```

(ถ้าเป็น Server Component ให้ใช้ `const { id } = await params;` ในฟังก์ชัน async)

### 2) Leaflet ต้องโหลดแบบ client-only

Leaflet อ้างอิง `window` จึงพังถ้า render ฝั่งเซิร์ฟเวอร์ ให้โหลดคอมโพเนนต์แผนที่ด้วย
dynamic import และปิด SSR:

```js
"use client";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });
```

(`ssr: false` ใช้ได้เฉพาะใน Client Component จึงต้องมี `"use client"` ที่ไฟล์นั้น)
และ `leaflet/dist/leaflet.css` ถูก import ไว้ใน `app/layout.js` แล้ว

## รันในเครื่อง (ไม่บังคับ)

```bash
npm install
npm run dev
```

## โครงสร้างไฟล์

```
ai-travel-planner/
├── app/
│   ├── layout.js
│   └── page.js
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```

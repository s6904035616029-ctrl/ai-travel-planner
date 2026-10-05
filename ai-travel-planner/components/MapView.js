"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";

// หมุดแบบ DivIcon ที่เป็นเลขลำดับ (ไม่พึ่งรูป icon เริ่มต้นของ Leaflet ที่มักแตกใน Next.js)
function makeIcon(n, state) {
  const bg = state === "done" ? "#9ca3af" : state === "new" ? "#f59e0b" : "#2563eb";
  const label = state === "done" ? "✓" : n;
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${bg};color:#fff;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 15px system-ui,sans-serif;">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

// ซูมให้เห็นทุกหมุดเมื่อเปลี่ยนวัน หรือเมื่อรายการหมุดเปลี่ยน (เช่น หลังปรับแผน)
function FitBounds({ points, signature }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

// ซูมไปที่หมุดที่ผู้ใช้กดจากรายการ แล้วเปิด popup
function FocusController({ focus, slots, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const slot = slots.find((s) => s.id === focus.id);
    if (!slot) return;
    map.flyTo([slot.lat, slot.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    const timer = setTimeout(() => markerRefs.current[slot.id]?.openPopup(), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  return null;
}

export default function MapView({ slots = [], focus = null, completedIds = [], highlightIds = [] }) {
  const markerRefs = useRef({});

  const points = useMemo(() => slots.map((s) => [s.lat, s.lng]), [slots]);
  const signature = useMemo(
    () => slots.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|"),
    [slots]
  );

  return (
    <MapContainer
      center={points[0] || [13.7563, 100.5018]}
      zoom={points.length ? 13 : 6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.6, dashArray: "8 8" }} />
      )}

      {slots.map((s, i) => {
        const state = completedIds.includes(s.id) ? "done" : highlightIds.includes(s.id) ? "new" : "todo";
        return (
          <Marker
            key={`${s.id}-${state}`}
            position={[s.lat, s.lng]}
            icon={makeIcon(i + 1, state)}
            ref={(m) => {
              if (m) markerRefs.current[s.id] = m;
              else delete markerRefs.current[s.id];
            }}
          >
            <Popup>
              <strong>{s.place}</strong>
              <br />
              🕒 {s.start} - {s.end}
              {s.note ? (
                <>
                  <br />
                  {s.note}
                </>
              ) : null}
            </Popup>
          </Marker>
        );
      })}

      <FitBounds points={points} signature={signature} />
      <FocusController focus={focus} slots={slots} markerRefs={markerRefs} />
    </MapContainer>
  );
}

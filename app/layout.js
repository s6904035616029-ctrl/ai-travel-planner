import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "AI Local Travel & Itinerary Planner",
  description: "วางแผนทริปด้วย AI พร้อมปรับแผนด่วนเมื่อฝนตกหรือร้านปิด",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', 'Noto Sans Thai', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}

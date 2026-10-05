export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>
        🗺️ AI Local Travel &amp; Itinerary Planner
      </h1>
      <p style={{ fontSize: "1.1rem", color: "#555" }}>
        ระบบวางแผนทริปท่องเที่ยวและปรับแผน Real-time
      </p>
      <p style={{ fontSize: "1.25rem", marginTop: "24px" }}>🚧 กำลังพัฒนา</p>
    </main>
  );
}

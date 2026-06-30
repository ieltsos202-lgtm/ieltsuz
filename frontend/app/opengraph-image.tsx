import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "IELTSUZ — AI IELTS tayyorgarlik platformasi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0F",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 140,
            height: 140,
            borderRadius: 32,
            background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: -3,
            marginBottom: 36,
          }}
        >
          UZ
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
          IELTSUZ
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#A5B4FC",
            marginTop: 12,
            fontWeight: 600,
          }}
        >
          AI IELTS tayyorgarlik platformasi
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#94A3B8",
            marginTop: 24,
            display: "flex",
          }}
        >
          Listening · Reading · Writing · Speaking
        </div>
      </div>
    ),
    { ...size }
  );
}

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

// Courier is the safest mono bundled with react-pdf.
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b", padding: 28 },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  prompt: { fontSize: 10, fontFamily: "Courier-Bold", marginTop: 2 },
  contact: { fontSize: 8, color: "#94a3b8", marginTop: 4, marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Courier-Bold", marginTop: 10, marginBottom: 8 },
  summary: { fontSize: 10, lineHeight: T.summaryLineHeight, marginBottom: 10 },
  exp: { marginBottom: T.expBlockMarginBottom },
  expHead: { marginBottom: 2 },
  expTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  at: { fontFamily: "Courier-Bold" },
  expDates: { fontSize: 8, color: "#94a3b8" },
  bullet: { fontSize: 9, color: "#475569", marginBottom: T.bulletMarginBottom, paddingLeft: 10, lineHeight: T.bulletLineHeight },
  skills: { fontSize: 9, fontFamily: "Courier", color: "#1e293b", lineHeight: 1.5 },
  eduLine: { fontSize: 9, marginBottom: 3 },
});

export default function Mono({ data, brandColors }: TemplateProps) {
  const accent = brandColors?.primary || "#10b981";
  const isFr = data.language === "fr";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
          {data.photo && <PhotoSlotPdf photo={data.photo} size={58} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={[styles.prompt, { color: accent }]}># {data.title}</Text>
            <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>
          </View>
        </View>

        {data.summary && (
          <View wrap={false}>
            <Text style={[styles.sectionTitle, { color: accent }]}>// {isFr ? "résumé" : "summary"}</Text>
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: accent }]}>// {isFr ? "expérience" : "experience"}</Text>
        {data.experiences.map((exp, i) => (
          <View key={i} wrap={false} style={styles.exp}>
            <View style={styles.expHead}>
              <Text style={styles.expTitle}>
                {exp.title}
                <Text style={[styles.at, { color: accent }]}>{" @ "}</Text>
                {exp.company}
                <Text style={styles.expDates}>{"  " + exp.dates}</Text>
              </Text>
            </View>
            {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`▸ ${b}`} style={styles.bullet} />)}
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: accent }]}>// {isFr ? "stack" : "stack"}</Text>
        <Text style={styles.skills}>{data.skills.join(" · ")}</Text>

        <Text style={[styles.sectionTitle, { color: accent }]}>// {isFr ? "formation" : "education"}</Text>
        {data.education.map((e, i) => (
          <Text key={i} style={styles.eduLine}>
            {e.degree}<Text style={{ color: accent }}>{" @ "}</Text>{e.school}{e.year ? `  (${e.year})` : ""}
          </Text>
        ))}
      </Page>
    </Document>
  );
}

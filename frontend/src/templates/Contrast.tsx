import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: { background: "linear-gradient(135deg, #0f172a, #1e3a5f)", backgroundColor: "#0f172a", color: "#ffffff", padding: "28 24 20 24" },
  headerName: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  headerTitle: { fontSize: 12, color: "#818cf8", marginBottom: 6 },
  headerContact: { fontSize: 9, color: "#94a3b8" },
  skillsBar: { flexDirection: "row", flexWrap: "wrap", gap: 4, padding: "10 24", backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  skillPill: { backgroundColor: "#6366f1", color: "#ffffff", padding: "4 10", borderRadius: 6, fontSize: 8, fontFamily: "Helvetica-Bold" },
  highlights: { borderLeftWidth: 4, borderLeftColor: "#6366f1", backgroundColor: "#f5f3ff", padding: "8 12", margin: "12 24 0 24" },
  highlightsLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: "#6366f1", marginBottom: 4 },
  highlightsText: { fontSize: 10, color: "#1e293b", lineHeight: T.summaryLineHeight },
  body: { padding: "12 24 24 24" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0f172a", paddingBottom: 6, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: "#6366f1" },
  expBlock: { marginBottom: T.expBlockMarginBottom },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  expCompany: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6366f1" },
  expDates: { fontSize: 9, color: "#94a3b8" },
  bullet: { fontSize: 9, color: "#475569", marginBottom: T.bulletMarginBottom, paddingLeft: 8, lineHeight: T.bulletLineHeight },
  eduItem: { fontSize: 9, marginBottom: 4 },
  eduSchool: { fontSize: 8, color: "#94a3b8" },
});

export default function Contrast({ data, brandColors }: TemplateProps) {
  const accentColor = brandColors?.primary || "#6366f1";
  const headerBg = brandColors?.secondary || "#0f172a";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { backgroundColor: headerBg, flexDirection: "row", alignItems: "center", gap: 16 }]}>
          {data.photo && <PhotoSlotPdf photo={data.photo} size={72} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName}>{data.name}</Text>
            <Text style={[styles.headerTitle, { color: accentColor }]}>{data.title}</Text>
            <Text style={styles.headerContact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>
          </View>
        </View>
        <View style={styles.skillsBar}>
          {data.skills.map((s, i) => <Text key={i} style={[styles.skillPill, { backgroundColor: accentColor }]}>{s}</Text>)}
        </View>
        {data.summary && (
          <View style={[styles.highlights, { borderLeftColor: accentColor }]}>
            <Text style={[styles.highlightsLabel, { color: accentColor }]}>{data.language === "fr" ? "Points clés" : "Key Highlights"}</Text>
            <Text style={styles.highlightsText}>{data.summary}</Text>
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { borderBottomColor: accentColor }]}>{data.language === "fr" ? "Expérience" : "Experience"}</Text>
            {data.experiences.map((exp, i) => (
              <View key={i} wrap={false} style={styles.expBlock}>
                <Text style={styles.expTitle}>{exp.title}</Text>
                <View style={styles.expMeta}>
                  <Text style={[styles.expCompany, { color: accentColor }]}>{exp.company}</Text>
                  <Text style={styles.expDates}>{exp.dates}</Text>
                </View>
                {exp.bullets.map((b, j) => (
                  <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { borderBottomColor: accentColor }]}>{data.language === "fr" ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 4 }}>
                <Text style={styles.eduItem}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}, {e.year}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={{ position: "absolute", bottom: 8, right: 12, fontSize: 6, color: "#e0e0e0", fontFamily: "Helvetica", opacity: 0.4 }}>bcv</Text>
      </Page>
    </Document>
  );
}

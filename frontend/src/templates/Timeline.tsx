import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b", padding: 28 },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  title: { fontSize: 11, color: "#475569", marginBottom: 2 },
  contact: { fontSize: 8, color: "#94a3b8", marginBottom: 14 },
  summary: { borderLeftWidth: 2, padding: "4 10", marginBottom: 14, fontSize: 10, lineHeight: 1.5 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  rail: { borderLeftWidth: 1, borderLeftColor: "#cbd5e1", paddingLeft: 18, marginLeft: 4 },
  exp: { marginBottom: 14, position: "relative" },
  dot: { position: "absolute", left: -22, top: 4, width: 6, height: 6, borderRadius: 3 },
  expDates: { fontSize: 8, color: "#94a3b8", marginBottom: 2 },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expCompany: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  bullet: { fontSize: 9, color: "#475569", marginBottom: 2, paddingLeft: 8 },
  split: { flexDirection: "row", gap: 24, marginTop: 10 },
  col: { flex: 1 },
  eduBlock: { marginBottom: 8 },
  eduDegree: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  eduSchool: { fontSize: 9, color: "#64748b" },
  skills: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
});

export default function Timeline({ data, brandColors }: TemplateProps) {
  const accent = brandColors?.primary || "#0f172a";
  const isFr = data.language === "fr";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>

        {data.summary && (
          <View wrap={false} style={[styles.summary, { borderLeftColor: accent }]}>
            <Text>{data.summary}</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Parcours" : "Career"}</Text>
        <View style={styles.rail}>
          {data.experiences.map((exp, i) => (
            <View key={i} wrap={false} style={styles.exp}>
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Text style={styles.expDates}>{exp.dates}</Text>
              <Text style={styles.expTitle}>{exp.title}</Text>
              <Text style={[styles.expCompany, { color: accent }]}>{exp.company}</Text>
              {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />)}
            </View>
          ))}
        </View>

        <View style={styles.split}>
          <View style={styles.col}>
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} wrap={false} style={styles.eduBlock}>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}{e.year ? `, ${e.year}` : ""}</Text>
              </View>
            ))}
          </View>
          <View style={styles.col}>
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Compétences" : "Skills"}</Text>
            <Text style={styles.skills}>{data.skills.join(" · ")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

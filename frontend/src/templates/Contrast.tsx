import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: { backgroundColor: "#0f172a", color: "#ffffff", padding: "28 24 20 24" },
  headerName: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  headerTitle: { fontSize: 12, color: "#818cf8", marginBottom: 6 },
  headerContact: { fontSize: 9, color: "#94a3b8" },
  skillsBar: { flexDirection: "row", flexWrap: "wrap", gap: 4, padding: "10 24", backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  skillPill: { backgroundColor: "#eef2ff", color: "#6366f1", padding: "3 8", borderRadius: 10, fontSize: 8, fontFamily: "Helvetica-Bold" },
  body: { padding: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0f172a", paddingBottom: 6, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: "#6366f1" },
  summary: { fontSize: 10, color: "#475569", lineHeight: 1.5 },
  expBlock: { marginBottom: 10 },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expMeta: { fontSize: 9, color: "#6366f1", marginBottom: 3 },
  bullet: { fontSize: 9, color: "#475569", marginBottom: 2, paddingLeft: 8 },
  eduItem: { fontSize: 9, marginBottom: 4 },
  eduSchool: { fontSize: 8, color: "#94a3b8" },
});

export default function Contrast({ data }: TemplateProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerName}>{data.name}</Text>
          <Text style={styles.headerTitle}>{data.title}</Text>
          <Text style={styles.headerContact}>{[data.location, data.email].filter(Boolean).join("  ·  ")}</Text>
        </View>
        <View style={styles.skillsBar}>
          {data.skills.map((s, i) => <Text key={i} style={styles.skillPill}>{s}</Text>)}
        </View>
        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "Résumé professionnel" : "Professional Summary"}</Text>
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "Expérience" : "Experience"}</Text>
            {data.experiences.map((exp, i) => (
              <View key={i} style={styles.expBlock}>
                <Text style={styles.expTitle}>{exp.title}</Text>
                <Text style={styles.expMeta}>{exp.company}  ·  {exp.dates}</Text>
                {exp.bullets.map((b, j) => <Text key={j} style={styles.bullet}>• {b}</Text>)}
              </View>
            ))}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={styles.eduItem}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}, {e.year}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

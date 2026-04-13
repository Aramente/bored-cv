import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b", padding: 32 },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#0f172a", marginBottom: 2 },
  title: { fontSize: 12, color: "#6366f1", marginBottom: 4 },
  contact: { fontSize: 9, color: "#94a3b8", marginBottom: 20 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", marginBottom: 12 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 8 },
  summary: { fontSize: 10, color: "#475569", lineHeight: 1.6 },
  expBlock: { marginBottom: 10 },
  expRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  expTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  expDates: { fontSize: 9, color: "#94a3b8" },
  expCompany: { fontSize: 9, color: "#6366f1", marginBottom: 3 },
  bullet: { fontSize: 9, color: "#475569", marginBottom: 2, paddingLeft: 8 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skill: { fontSize: 9, color: "#475569" },
  eduBlock: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
});

export default function Minimal({ data }: TemplateProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.contact}>{[data.location, data.email].filter(Boolean).join("  ·  ")}</Text>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Résumé" : "Summary"}</Text>
          <Text style={styles.summary}>{data.summary}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Expérience" : "Experience"}</Text>
          {data.experiences.map((exp, i) => (
            <View key={i} style={styles.expBlock}>
              <View style={styles.expRow}>
                <Text style={styles.expTitle}>{exp.title}</Text>
                <Text style={styles.expDates}>{exp.dates}</Text>
              </View>
              <Text style={styles.expCompany}>{exp.company}</Text>
              {exp.bullets.map((b, j) => <Text key={j} style={styles.bullet}>• {b}</Text>)}
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Formation" : "Education"}</Text>
          {data.education.map((e, i) => (
            <View key={i} style={styles.eduBlock}>
              <Text style={{ fontSize: 9 }}>{e.degree}  —  {e.school}</Text>
              <Text style={{ fontSize: 9, color: "#94a3b8" }}>{e.year}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Compétences" : "Skills"}</Text>
          <View style={styles.skillsRow}>
            {data.skills.map((s, i) => (
              <Text key={i} style={styles.skill}>{s}{i < data.skills.length - 1 ? "  ·" : ""}</Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

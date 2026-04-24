import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#111111", padding: 32 },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#000000", marginBottom: 2 },
  title: { fontSize: 12, color: "#333333", marginBottom: 4 },
  contact: { fontSize: 9, color: "#555555", marginBottom: 20 },
  divider: { borderBottomWidth: 0.25, borderBottomColor: "#cccccc", marginBottom: 12 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#555555", marginBottom: 8 },
  highlights: { marginBottom: 14 },
  highlightsLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#555555", marginBottom: 6 },
  highlightBullet: { fontSize: 10, color: "#111111", lineHeight: 1.55, marginBottom: 3, paddingLeft: 10 },
  expBlock: { marginBottom: 12 },
  expRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  expTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  expDates: { fontSize: 9, color: "#555555" },
  expCompany: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#222222", marginBottom: 3 },
  bullet: { fontSize: 9, color: "#333333", marginBottom: 2, paddingLeft: 8 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skill: { fontSize: 9, color: "#333333" },
  eduBlock: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
});

export default function Minimal({ data, brandColors }: TemplateProps) {
  const accentColor = brandColors?.primary || "#555555";
  // Split summary into bullet points if it contains line breaks or sentence separators
  const highlightLines = data.summary
    ? data.summary.split(/\n|(?<=\.)\s+(?=[A-ZÁÀÂÄÉÈÊËÎÏÔÙÛÜÇ])/).filter(Boolean)
    : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>
        <View style={styles.divider} />
        {data.summary && (
          <>
            <View style={styles.highlights}>
              <Text style={[styles.highlightsLabel, { color: accentColor }]}>{data.language === "fr" ? "Points clés" : "Key Highlights"}</Text>
              {highlightLines.length > 1
                ? highlightLines.map((line, i) => (
                    <Text key={i} style={styles.highlightBullet}>· {line.trim()}</Text>
                  ))
                : <Text style={styles.highlightBullet}>{data.summary}</Text>
              }
            </View>
            <View style={styles.divider} />
          </>
        )}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>{data.language === "fr" ? "Expérience" : "Experience"}</Text>
          {data.experiences.map((exp, i) => (
            <View key={i} wrap={false} style={styles.expBlock}>
              <View style={styles.expRow}>
                <Text style={styles.expTitle}>{exp.title}</Text>
                <Text style={styles.expDates}>{exp.dates}</Text>
              </View>
              <Text style={styles.expCompany}>{exp.company}</Text>
              {exp.bullets.map((b, j) => (
                <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>{data.language === "fr" ? "Formation" : "Education"}</Text>
          {data.education.map((e, i) => (
            <View key={i} wrap={false} style={styles.eduBlock}>
              <Text style={{ fontSize: 9 }}>{e.degree}  —  {e.school}</Text>
              <Text style={{ fontSize: 9, color: "#555555" }}>{e.year}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>{data.language === "fr" ? "Compétences" : "Skills"}</Text>
          <View style={styles.skillsRow}>
            {data.skills.map((s, i) => (
              <Text key={i} style={styles.skill}>{s}{i < data.skills.length - 1 ? "  ·" : ""}</Text>
            ))}
          </View>
        </View>
        <Text style={{ position: "absolute", bottom: 8, right: 12, fontSize: 6, color: "#e0e0e0", fontFamily: "Helvetica", opacity: 0.4 }}>bcv</Text>
      </Page>
    </Document>
  );
}

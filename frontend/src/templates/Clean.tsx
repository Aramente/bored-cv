import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";

const styles = StyleSheet.create({
  page: { flexDirection: "row", fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  sidebar: { width: "30%", backgroundColor: "#0c1f3d", color: "#e2e8f0", padding: 24, borderTopWidth: 2, borderTopColor: "#F5C542" },
  sidebarName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff", marginBottom: 4 },
  sidebarTitle: { fontSize: 10, color: "#94a3b8", marginBottom: 16 },
  sidebarSection: { marginBottom: 14 },
  sidebarSectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 6 },
  skillTag: { backgroundColor: "rgba(255,255,255,0.1)", padding: "3 6", borderRadius: 3, fontSize: 8, marginBottom: 3, marginRight: 3 },
  skillsContainer: { flexDirection: "row", flexWrap: "wrap" },
  main: { width: "70%", padding: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: "#0f172a", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingBottom: 4, marginBottom: 10 },
  highlights: { borderLeftWidth: 3, borderLeftColor: "#6366f1", backgroundColor: "#f5f3ff", padding: "8 10", marginBottom: 16, borderRadius: 2 },
  highlightsLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: "#6366f1", marginBottom: 4 },
  highlightsText: { fontSize: 10, color: "#1e293b", lineHeight: 1.55 },
  expBlock: { marginBottom: 12, borderLeftWidth: 2, borderLeftColor: "#6366f1", paddingLeft: 8 },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expCompany: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6366f1", marginBottom: 2 },
  expDates: { fontSize: 8, color: "#94a3b8", marginBottom: 4 },
  bullet: { fontSize: 9, color: "#475569", marginBottom: 2, paddingLeft: 8 },
  contactItem: { fontSize: 8, color: "#cbd5e1", marginBottom: 3 },
});

export default function Clean({ data, brandColors }: TemplateProps) {
  const accentColor = brandColors?.primary || "#6366f1";
  const sidebarBg = brandColors?.secondary || "#0c1f3d";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.sidebar, { backgroundColor: sidebarBg }]}>
          <Text style={styles.sidebarName}>{data.name}</Text>
          <Text style={styles.sidebarTitle}>{data.title}</Text>
          {(data.email || data.location) && (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarSectionTitle}>Contact</Text>
              {data.email && <Text style={styles.contactItem}>{data.email}</Text>}
              {data.phone && <Text style={styles.contactItem}>{data.phone}</Text>}
              {data.linkedin && <Text style={styles.contactItem}>{data.linkedin}</Text>}
              {data.location && <Text style={styles.contactItem}>{data.location}</Text>}
            </View>
          )}
          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarSectionTitle}>{data.language === "fr" ? "Compétences" : "Skills"}</Text>
            <View style={styles.skillsContainer}>
              {data.skills.map((s, i) => <Text key={i} style={styles.skillTag}>{s}</Text>)}
            </View>
          </View>
          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarSectionTitle}>{data.language === "fr" ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{e.degree}</Text>
                <Text style={styles.contactItem}>{e.school}, {e.year}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.main}>
          {data.summary && (
            <View style={[styles.highlights, { borderLeftColor: accentColor }]}>
              <Text style={[styles.highlightsLabel, { color: accentColor }]}>{data.language === "fr" ? "Points clés" : "Key Highlights"}</Text>
              <Text style={styles.highlightsText}>{data.summary}</Text>
            </View>
          )}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "Expérience" : "Experience"}</Text>
            {data.experiences.map((exp, i) => (
              <View key={i} style={[styles.expBlock, { borderLeftColor: accentColor }]}>
                <Text style={styles.expTitle}>{exp.title}</Text>
                <Text style={[styles.expCompany, { color: accentColor }]}>{exp.company}</Text>
                <Text style={styles.expDates}>{exp.dates}</Text>
                {exp.bullets.map((b, j) => (
                  <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />
                ))}
              </View>
            ))}
          </View>
        </View>
        <Text style={{ position: "absolute", bottom: 8, right: 12, fontSize: 6, color: "#e0e0e0", fontFamily: "Helvetica", opacity: 0.4 }}>bcv</Text>
      </Page>
    </Document>
  );
}

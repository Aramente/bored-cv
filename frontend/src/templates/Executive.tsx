import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

const styles = StyleSheet.create({
  page: { fontFamily: "Times-Roman", fontSize: 10, color: "#1e293b", padding: "36 42" },
  header: { paddingBottom: 10, marginBottom: 16, borderBottomWidth: 1.5 },
  name: { fontSize: 22, fontFamily: "Times-Bold", letterSpacing: 1, textAlign: "center" },
  title: { fontSize: 11, fontFamily: "Times-Italic", color: "#475569", textAlign: "center", marginTop: 2 },
  contact: { fontSize: 8, color: "#94a3b8", textAlign: "center", marginTop: 6 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Times-Bold", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
  ornament: { width: 18, height: 2, marginBottom: 6 },
  summary: { fontSize: 11, lineHeight: T.summaryLineHeight, fontFamily: "Times-Italic", marginBottom: 14 },
  exp: { marginBottom: T.expBlockMarginBottom },
  expHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  expTitle: { fontSize: 11, fontFamily: "Times-Bold" },
  expCompany: { fontSize: 10, fontFamily: "Times-Italic", color: "#475569" },
  expDates: { fontSize: 9, color: "#94a3b8" },
  bullet: { fontSize: 10, color: "#334155", marginBottom: T.bulletMarginBottom, paddingLeft: 10, lineHeight: T.bulletLineHeight },
  split: { flexDirection: "row", gap: 32, marginTop: 6 },
  col: { flex: 1 },
  eduBlock: { marginBottom: 6 },
  eduDegree: { fontSize: 10, fontFamily: "Times-Bold" },
  eduSchool: { fontSize: 9, color: "#64748b" },
  skills: { fontSize: 10, color: "#334155", lineHeight: 1.5 },
});

export default function Executive({ data, brandColors }: TemplateProps) {
  const accent = brandColors?.primary || "#1e293b";
  const gold = brandColors?.secondary || "#b8860b";
  const isFr = data.language === "fr";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: gold }]}>
          {data.photo && (
            <View style={{ alignItems: "center", marginBottom: 10 }}>
              <PhotoSlotPdf photo={data.photo} size={72} />
            </View>
          )}
          <Text style={[styles.name, { color: accent }]}>{data.name}</Text>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>
        </View>

        {data.summary && (
          <View wrap={false}>
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={[styles.ornament, { backgroundColor: gold }]} />
          <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Expérience professionnelle" : "Professional Experience"}</Text>
          {data.experiences.map((exp, i) => (
            <View key={i} wrap={false} style={styles.exp}>
              <View style={styles.expHead}>
                <View>
                  <Text style={[styles.expTitle, { color: accent }]}>{exp.title}</Text>
                  <Text style={styles.expCompany}>{exp.company}</Text>
                </View>
                <Text style={styles.expDates}>{exp.dates}</Text>
              </View>
              {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`— ${b}`} style={styles.bullet} />)}
            </View>
          ))}
        </View>

        <View style={styles.split}>
          <View style={styles.col}>
            <View style={[styles.ornament, { backgroundColor: gold }]} />
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} wrap={false} style={styles.eduBlock}>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}{e.year ? `, ${e.year}` : ""}</Text>
              </View>
            ))}
          </View>
          <View style={styles.col}>
            <View style={[styles.ornament, { backgroundColor: gold }]} />
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Expertise" : "Expertise"}</Text>
            <Text style={styles.skills}>{data.skills.join(" · ")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

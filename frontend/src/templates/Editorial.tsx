import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

const styles = StyleSheet.create({
  page: { fontFamily: "Times-Roman", fontSize: 10, color: "#1e1b2e", padding: "36 44" },
  eyebrow: { fontSize: 8, fontFamily: "Times-Bold", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 },
  name: { fontSize: 32, fontFamily: "Times-Bold", color: "#0f0c1d", lineHeight: 1.05, marginBottom: 4 },
  title: { fontSize: 12, fontFamily: "Times-Italic", color: "#3f3654", marginBottom: 14 },
  lede: { fontSize: 13, fontFamily: "Times-Italic", lineHeight: T.summaryLineHeight, color: "#1e1b2e", marginBottom: 14, paddingLeft: 12, borderLeftWidth: 3 },
  contact: { fontSize: 8, color: "#7a7090", marginBottom: 18, letterSpacing: 0.3 },
  sectionTitle: { fontSize: 10, fontFamily: "Times-Bold", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, marginTop: 4 },
  exp: { marginBottom: T.expBlockMarginBottom + 2 },
  expMeta: { flexDirection: "row", gap: 10, marginBottom: 2 },
  expDates: { fontSize: 9, fontFamily: "Times-Bold", letterSpacing: 0.8 },
  expCompany: { fontSize: 9, fontFamily: "Times-Italic", color: "#3f3654" },
  expTitle: { fontSize: 13, fontFamily: "Times-Bold", marginBottom: 4 },
  bullet: { fontSize: 10, color: "#2a2440", marginBottom: T.bulletMarginBottom, paddingLeft: 12, lineHeight: 1.55 },
  split: { flexDirection: "row", gap: 28, marginTop: 8 },
  col: { flex: 1 },
  eduBlock: { marginBottom: 6 },
  eduDegree: { fontSize: 10, fontFamily: "Times-Bold" },
  eduSchool: { fontSize: 9, fontFamily: "Times-Italic", color: "#5f5478" },
  skills: { fontSize: 10, color: "#2a2440", lineHeight: 1.6 },
  contractType: { fontSize: 8, fontFamily: "Times-Bold", color: "#5f5478", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 },
  headcount: { fontSize: 8, fontFamily: "Times-Italic", color: "#9e93b8", marginBottom: 4 },
  exitReason: { fontSize: 9, fontFamily: "Times-Italic", color: "#5f5478", marginTop: 4 },
});

export default function Editorial({ data, brandColors }: TemplateProps) {
  const accent = brandColors?.primary || "#7c3aed";
  const isFr = data.language === "fr";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: accent }]}>{isFr ? "Portfolio" : "Curriculum"}</Text>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={styles.title}>{data.title}</Text>
          </View>
          {data.photo && <PhotoSlotPdf photo={data.photo} size={72} />}
        </View>

        {data.summary && (
          <View wrap={false}>
            <Text style={[styles.lede, { borderLeftColor: accent }]}>{data.summary}</Text>
          </View>
        )}

        <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ")}</Text>

        <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Chapitres" : "Chapters"}</Text>
        {data.experiences.map((exp, i) => (
          <View key={i} wrap={false} style={styles.exp}>
            <View style={styles.expMeta}>
              <Text style={[styles.expDates, { color: accent }]}>{exp.dates}</Text>
              <Text style={styles.expCompany}>— {exp.company}</Text>
            </View>
            <Text style={styles.expTitle}>{exp.title}</Text>
            {exp.contractType ? <Text style={styles.contractType}>{exp.contractType}</Text> : null}
            {(exp.headcountStart || exp.headcountEnd) ? <Text style={styles.headcount}>{exp.headcountStart || "?"} → {exp.headcountEnd || "?"}</Text> : null}
            {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`· ${b}`} style={styles.bullet} />)}
            {exp.exitReason ? <Text style={styles.exitReason}>{exp.exitReason}</Text> : null}
          </View>
        ))}

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
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Outils & savoirs" : "Toolkit"}</Text>
            <Text style={styles.skills}>{data.skills.join(" · ")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

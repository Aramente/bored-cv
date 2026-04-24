import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#0f172a", padding: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 6, borderBottomWidth: 1.5, marginBottom: 10 },
  headerLeft: {},
  name: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  title: { fontSize: 10, color: "#475569", marginTop: 1 },
  contact: { fontSize: 8, color: "#64748b", textAlign: "right", lineHeight: 1.4 },
  summary: { fontSize: 9, lineHeight: T.summaryLineHeight, color: "#1e293b", marginBottom: 10 },
  grid: { flexDirection: "row", gap: 18 },
  main: { flex: 2.4 },
  aside: { flex: 1 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  exp: { marginBottom: T.expBlockMarginBottom },
  expHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  expTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  expDates: { fontSize: 8, color: "#64748b" },
  expCompany: { fontSize: 8, marginBottom: 3 },
  bullet: { fontSize: 8.5, color: "#334155", marginBottom: T.bulletMarginBottom, paddingLeft: 8, lineHeight: T.bulletLineHeight },
  skills: { fontSize: 8.5, color: "#1e293b", lineHeight: 1.5 },
  eduBlock: { marginBottom: 5 },
  eduDegree: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  eduSchool: { fontSize: 8, color: "#64748b" },
  contractType: { fontSize: 6.5, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  headcount: { fontSize: 6.5, color: "#94a3b8", marginBottom: 2, fontFamily: "Helvetica" },
  exitReason: { fontSize: 7.5, color: "#64748b", fontStyle: "italic", marginTop: 2 },
});

export default function Compact({ data, brandColors }: TemplateProps) {
  const accent = brandColors?.primary || "#0f172a";
  const isFr = data.language === "fr";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: accent }]}>
          <View style={[styles.headerLeft, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
            {data.photo && <PhotoSlotPdf photo={data.photo} size={52} />}
            <View>
              <Text style={styles.name}>{data.name}</Text>
              <Text style={styles.title}>{data.title}</Text>
            </View>
          </View>
          <Text style={styles.contact}>{[data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("\n")}</Text>
        </View>

        {data.summary && (
          <View wrap={false}>
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        <View style={styles.grid}>
          <View style={styles.main}>
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Expérience" : "Experience"}</Text>
            {data.experiences.map((exp, i) => (
              <View key={i} wrap={false} style={styles.exp}>
                <View style={styles.expHead}>
                  <Text style={styles.expTitle}>{exp.title}</Text>
                  <Text style={styles.expDates}>{exp.dates}</Text>
                </View>
                <Text style={[styles.expCompany, { color: accent }]}>{exp.company}</Text>
                {exp.contractType ? <Text style={styles.contractType}>{exp.contractType}</Text> : null}
                {(exp.headcountStart || exp.headcountEnd) ? <Text style={styles.headcount}>{exp.headcountStart || "?"} → {exp.headcountEnd || "?"}</Text> : null}
                {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />)}
                {exp.exitReason ? <Text style={styles.exitReason}>{exp.exitReason}</Text> : null}
              </View>
            ))}
          </View>

          <View style={styles.aside}>
            <Text style={[styles.sectionTitle, { color: accent }]}>{isFr ? "Compétences" : "Skills"}</Text>
            <Text style={styles.skills}>{data.skills.join(" · ")}</Text>

            <Text style={[styles.sectionTitle, { color: accent, marginTop: 10 }]}>{isFr ? "Formation" : "Education"}</Text>
            {data.education.map((e, i) => (
              <View key={i} wrap={false} style={styles.eduBlock}>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}{e.year ? `, ${e.year}` : ""}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

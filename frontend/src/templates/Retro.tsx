import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";
import PhotoSlotPdf from "./PhotoSlotPdf";
import { T } from "./tokens";

const styles = StyleSheet.create({
  page: { fontFamily: "Courier", fontSize: 10, color: "#2c2415", padding: "32 36", backgroundColor: "#faf5e8" },
  header: { borderWidth: 2, borderColor: "#2c2415", padding: "12 14", marginBottom: 18, backgroundColor: "#faf5e8" },
  name: { fontSize: 20, fontFamily: "Courier-Bold", textTransform: "uppercase", letterSpacing: 2, marginBottom: 3 },
  titleLine: { fontSize: 10, fontFamily: "Courier-Oblique", marginBottom: 6 },
  contact: { fontSize: 8, fontFamily: "Courier", color: "#5c4a2a" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#2c2415", marginBottom: 10 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Courier-Bold", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  expBlock: { marginBottom: T.expBlockMarginBottom },
  expHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  expCompany: { fontSize: 10, fontFamily: "Courier-Bold" },
  expDates: { fontSize: 9, fontFamily: "Courier", color: "#5c4a2a" },
  expTitle: { fontSize: 9, fontFamily: "Courier-Oblique", marginBottom: 4, color: "#5c4a2a" },
  bullet: { fontSize: 9, fontFamily: "Courier", color: "#2c2415", marginBottom: T.bulletMarginBottom, paddingLeft: 10, lineHeight: T.bulletLineHeight },
  summary: { fontSize: 9, fontFamily: "Courier-Oblique", lineHeight: T.summaryLineHeight, marginBottom: 14, color: "#3c2e10", borderLeftWidth: 2, borderLeftColor: "#8a7050", paddingLeft: 10 },
  skillsText: { fontSize: 9, fontFamily: "Courier", color: "#2c2415", lineHeight: 1.5 },
  eduRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  eduDegree: { fontSize: 9, fontFamily: "Courier-Bold" },
  eduMeta: { fontSize: 8, fontFamily: "Courier", color: "#5c4a2a" },
});

export default function Retro({ data, brandColors }: TemplateProps) {
  const accentColor = brandColors?.primary || "#2c2415";
  const accentLight = brandColors?.secondary || "#8a7050";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderColor: accentColor, flexDirection: "row", alignItems: "center", gap: 14 }]}>
          {data.photo && <PhotoSlotPdf photo={data.photo} size={64} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={styles.titleLine}>_{data.title}_</Text>
            <Text style={styles.contact}>{[data.email, data.phone, data.linkedin, data.location].filter(Boolean).join("  //  ")}</Text>
          </View>
        </View>

        {data.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "PROFIL" : "PROFILE"}</Text>
            <View style={[styles.divider, { borderBottomColor: accentColor }]} />
            <Text style={[styles.summary, { borderLeftColor: accentLight }]}>{data.summary}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "EXPÉRIENCE" : "EXPERIENCE"}</Text>
          <View style={[styles.divider, { borderBottomColor: accentColor }]} />
          {data.experiences.map((exp, i) => (
            <View key={i} wrap={false} style={styles.expBlock}>
              <View style={styles.expHeader}>
                <Text style={styles.expCompany}>{exp.company}</Text>
                <Text style={styles.expDates}>[{exp.dates}]</Text>
              </View>
              <Text style={styles.expTitle}>{exp.title}</Text>
              {exp.bullets.map((b, j) => (
                <BoldMetrics key={j} text={`>> ${b}`} style={styles.bullet} />
              ))}
            </View>
          ))}
        </View>

        {data.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "FORMATION" : "EDUCATION"}</Text>
            <View style={[styles.divider, { borderBottomColor: accentColor }]} />
            {data.education.map((e, i) => (
              <View key={i} wrap={false} style={styles.eduRow}>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduMeta}>{e.school}  [{e.year}]</Text>
              </View>
            ))}
          </View>
        )}

        {data.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "COMPÉTENCES" : "SKILLS"}</Text>
            <View style={[styles.divider, { borderBottomColor: accentColor }]} />
            <Text style={styles.skillsText}>{data.skills.join(", ")}</Text>
          </View>
        )}
        <Text style={{ position: "absolute", bottom: 8, right: 12, fontSize: 6, color: "#e0e0e0", fontFamily: "Helvetica", opacity: 0.4 }}>bcv</Text>
      </Page>
    </Document>
  );
}

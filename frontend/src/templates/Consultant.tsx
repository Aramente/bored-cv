import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { TemplateProps } from "./types";
import { BoldMetrics } from "./BoldMetrics";

const styles = StyleSheet.create({
  page: { fontFamily: "Times-Roman", fontSize: 10, color: "#111111", padding: "28 40" },
  topRule: { borderTopWidth: 1.5, borderTopColor: "#111111", marginBottom: 2 },
  topRuleThin: { borderTopWidth: 0.5, borderTopColor: "#444444", marginBottom: 16 },
  nameBlock: { alignItems: "center", marginBottom: 12 },
  name: { fontSize: 18, fontFamily: "Times-Bold", textTransform: "uppercase", letterSpacing: 3, marginBottom: 3 },
  titleLine: { fontSize: 10, fontFamily: "Times-Roman", color: "#333333", letterSpacing: 1.5 },
  contact: { fontSize: 8, fontFamily: "Times-Roman", color: "#555555", marginTop: 3, letterSpacing: 0.5 },
  rule: { borderBottomWidth: 0.5, borderBottomColor: "#333333", marginBottom: 10 },
  sectionTitle: { fontSize: 9, fontFamily: "Times-Bold", textTransform: "uppercase", letterSpacing: 1.5, color: "#111111", marginBottom: 6 },
  section: { marginBottom: 14 },
  expBlock: { marginBottom: 10 },
  expHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  expCompany: { fontSize: 10, fontFamily: "Times-Bold" },
  expDates: { fontSize: 9, fontFamily: "Times-Roman", color: "#444444" },
  expTitle: { fontSize: 9, fontFamily: "Times-Italic", color: "#333333", marginBottom: 4 },
  bullet: { fontSize: 9, fontFamily: "Times-Roman", color: "#222222", marginBottom: 2, paddingLeft: 10, lineHeight: 1.5 },
  summary: { fontSize: 9, fontFamily: "Times-Roman", lineHeight: 1.6, color: "#222222", marginBottom: 2 },
  eduRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  eduDegree: { fontSize: 10, fontFamily: "Times-Bold" },
  eduMeta: { fontSize: 9, fontFamily: "Times-Roman", color: "#444444" },
  eduSchool: { fontSize: 9, fontFamily: "Times-Italic", color: "#333333" },
  skillsText: { fontSize: 9, fontFamily: "Times-Roman", color: "#222222", lineHeight: 1.6 },
  bottomRuleThin: { borderTopWidth: 0.5, borderTopColor: "#444444", marginTop: 16, marginBottom: 2 },
  bottomRule: { borderTopWidth: 1.5, borderTopColor: "#111111" },
});

function BoldLeadBullet({ text, style }: { text: string; style: Style }) {
  // Split on first colon to bold the lead-in phrase
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    const lead = text.slice(0, colonIdx + 1);
    const rest = text.slice(colonIdx + 1);
    return (
      <Text style={style}>
        <Text style={{ fontFamily: "Times-Bold" }}>{lead}</Text>
        <Text>{rest}</Text>
      </Text>
    );
  }
  return <BoldMetrics text={text} style={style} />;
}

export default function Consultant({ data, brandColors }: TemplateProps) {
  const accentColor = brandColors?.primary || "#111111";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.topRule, { borderTopColor: accentColor }]} />
        <View style={styles.topRuleThin} />

        <View style={styles.nameBlock}>
          <Text style={styles.name}>{data.name}</Text>
          <Text style={styles.titleLine}>{data.title.toUpperCase()}</Text>
          <Text style={styles.contact}>{[data.email, data.phone, data.linkedin, data.location].filter(Boolean).join("  ·  ")}</Text>
        </View>

        {/* Education first — consultant convention */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Formation" : "Education"}</Text>
          <View style={[styles.rule, { borderBottomColor: accentColor }]} />
          {data.education.map((e, i) => (
            <View key={i} style={styles.eduRow}>
              <View>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduSchool}>{e.school}</Text>
              </View>
              <Text style={styles.eduMeta}>{e.year}</Text>
            </View>
          ))}
        </View>

        {/* Skills second */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Compétences" : "Core Competencies"}</Text>
          <View style={[styles.rule, { borderBottomColor: accentColor }]} />
          <Text style={styles.skillsText}>{data.skills.join("  ·  ")}</Text>
        </View>

        {data.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{data.language === "fr" ? "Profil" : "Executive Summary"}</Text>
            <View style={[styles.rule, { borderBottomColor: accentColor }]} />
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.language === "fr" ? "Expérience Professionnelle" : "Professional Experience"}</Text>
          <View style={[styles.rule, { borderBottomColor: accentColor }]} />
          {data.experiences.map((exp, i) => (
            <View key={i} wrap={false} style={styles.expBlock}>
              <View style={styles.expHeader}>
                <Text style={styles.expCompany}>{exp.company}</Text>
                <Text style={styles.expDates}>{exp.dates}</Text>
              </View>
              <Text style={styles.expTitle}>{exp.title}</Text>
              {exp.bullets.map((b, j) => (
                <BoldLeadBullet key={j} text={`• ${b}`} style={styles.bullet} />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.bottomRuleThin} />
        <View style={[styles.bottomRule, { borderTopColor: accentColor }]} />
        <Text style={{ position: "absolute", bottom: 8, right: 12, fontSize: 6, color: "#e0e0e0", fontFamily: "Helvetica", opacity: 0.4 }}>bcv</Text>
      </Page>
    </Document>
  );
}

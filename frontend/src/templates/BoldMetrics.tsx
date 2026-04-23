import { Text } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

interface BoldMetricsProps {
  text: string;
  style: Style;
}

// Matches {GAP: question — e.g. example} tokens emitted by the LLM when a
// fact would have been fabricated. Rendered in amber so the user sees exactly
// what to fill in before downloading the CV.
const TOKEN_PATTERN = /(\{GAP:[^}]+\}|\d+[\d,.]*%?|\d+[kKmMbB]?\+?)/g;

export function BoldMetrics({ text, style }: BoldMetricsProps) {
  const parts = text.split(TOKEN_PATTERN);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith("{GAP:")) {
          return (
            <Text
              key={i}
              style={{
                backgroundColor: "#FEF3C7",
                color: "#92400E",
                fontFamily: "Helvetica-Oblique",
              }}
            >
              {part}
            </Text>
          );
        }
        if (/\d/.test(part)) {
          return (
            <Text key={i} style={{ fontFamily: "Helvetica-Bold" }}>
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

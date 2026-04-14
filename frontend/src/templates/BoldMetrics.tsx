import { Text } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

interface BoldMetricsProps {
  text: string;
  style: Style;
}

export function BoldMetrics({ text, style }: BoldMetricsProps) {
  const parts = text.split(/(\d+[\d,.]*%?|\d+[kKmMbB]?\+?)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /\d/.test(part) ? (
          <Text key={i} style={{ fontFamily: "Helvetica-Bold" }}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

import { useState } from "react";

export interface ArchetypeDefinition {
  name: string;
  title: string;
  description: string;
  example: string;
  icon: string;
  color: string;
}

const ARCHEYPES: ArchetypeDefinition[] = [
  {
    name: "BUILDER",
    title: "Builder",
    description: "Creates from scratch, establishes new functions, processes, or products where none existed.",
    example: "Built the People function from 0 → 1, established first hiring processes, designed initial comp structure.",
    icon: "🏗️",
    color: "var(--gold, #fbbf24)",
  },
  {
    name: "SCALER",
    title: "Scaler",
    description: "Takes something existing and grows it significantly — team size, revenue, market reach, or impact.",
    example: "Scaled the team from 5 → 45 in 18 months, expanded from 1 to 5 countries, grew revenue 300%.",
    icon: "📈",
    color: "var(--green, #2d9d3f)",
  },
  {
    name: "OPTIMIZER",
    title: "Optimizer",
    description: "Improves efficiency, reduces waste, streamlines processes, or makes existing systems better.",
    example: "Reduced time-to-hire from 6 to 3 weeks, cut payroll errors by 90%, improved onboarding completion rate.",
    icon: "⚙️",
    color: "var(--blue, #3b82f6)",
  },
  {
    name: "TRANSFORMER",
    title: "Transformer",
    description: "Leads major change management — restructuring, cultural shifts, digital transformations, or pivots.",
    example: "Led HRIS migration from legacy to modern platform, restructured the People team across 3 locations.",
    icon: "🔄",
    color: "var(--purple, #8b5cf6)",
  },
  {
    name: "PROBLEM-SOLVER",
    title: "Problem-Solver",
    description: "Steps into crisis situations, fixes what's broken, troubleshoots complex operational failures.",
    example: "Turned around 70% voluntary attrition to 5%, resolved payroll crisis affecting 200 employees.",
    icon: "🔧",
    color: "var(--red, #dc2626)",
  },
];

interface ValueArchetypeCardProps {
  archetypeNames?: string[];
  onClose?: () => void;
  compact?: boolean;
}

export default function ValueArchetypeCard({ archetypeNames, onClose, compact = false }: ValueArchetypeCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Filter to only show archetypes mentioned in the brief
  const relevantArchetypes = archetypeNames 
    ? ARCHEYPES.filter(a => archetypeNames.some(name => name.toUpperCase().includes(a.name)))
    : ARCHEYPES;
  
  if (relevantArchetypes.length === 0) {
    return null;
  }
  
  if (compact) {
    return (
      <div style={{
        padding: "8px 12px",
        marginTop: 8,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-card, #fafaf9)",
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            🎭 Your Value Archetypes
          </strong>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: "2px 6px" }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: expanded ? 8 : 0 }}>
          {relevantArchetypes.map((arch) => (
            <div key={arch.name} style={{
              padding: "4px 8px",
              background: arch.color + "20",
              border: `1px solid ${arch.color}40`,
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: arch.color,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              {arch.icon} {arch.title}
            </div>
          ))}
        </div>
        
        {expanded && (
          <div style={{ borderTop: "1px dashed var(--border-light)", paddingTop: 8 }}>
            {relevantArchetypes.map((arch) => (
              <div key={arch.name} style={{ marginBottom: 8, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14 }}>{arch.icon}</span>
                  <strong style={{ color: arch.color }}>{arch.title}:</strong>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
                  {arch.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div style={{
      padding: "12px 14px",
      marginTop: 12,
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--bg-card, #fafaf9)",
      fontSize: 14,
      lineHeight: 1.5,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
          🎭 Value Archetypes Explained
        </strong>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: 0 }}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
      
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
        These are the patterns of value you bring. Knowing your archetype helps frame your achievements more powerfully.
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {relevantArchetypes.map((arch) => (
          <div key={arch.name} style={{
            padding: "10px",
            border: `1px solid ${arch.color}40`,
            borderRadius: 6,
            background: arch.color + "10",
            fontSize: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{arch.icon}</span>
              <strong style={{ color: arch.color }}>{arch.title}</strong>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
              {arch.description}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic", lineHeight: 1.3 }}>
              Example: {arch.example}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>
        Your chat answers will be stronger when framed through these archetypes
      </div>
    </div>
  );
}
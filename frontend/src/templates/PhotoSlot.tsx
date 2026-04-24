import { useRef } from "react";
import { useStore } from "../store";

/**
 * Circular profile photo slot for the WYSIWYG preview. Renders:
 *   - a dashed "+" placeholder when no photo is set (clickable to upload)
 *   - a round photo with a hover × remove button when one is set
 *
 * Every template that wants a photo renders <PhotoSlot /> in its header area.
 * The image itself is kept in CVData.photo (base64 data URL) so it survives
 * reloads alongside the rest of the CV.
 *
 * `tone` swaps the placeholder colors between light (on white backgrounds,
 * e.g. Minimal/Executive) and dark (on the navy sidebar in Clean or the black
 * header in Contrast).
 */
interface Props {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  tone?: "light" | "dark";
  onError?: (msg: string) => void;
}

export default function PhotoSlot({ size = 80, className, style, tone = "light", onError }: Props) {
  const photo = useStore((s) => s.cvData?.photo);
  const updateCvField = useStore((s) => s.updateCvField);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!f) return;
    try {
      const b64 = await resizeToBase64(f, 400, 0.85);
      updateCvField("photo", b64);
    } catch (err) {
      onError?.((err as Error).message || "Photo upload failed");
    }
  };

  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateCvField("photo", "");
  };

  const borderColor = tone === "dark" ? "rgba(255,255,255,0.4)" : "rgba(15,23,42,0.25)";
  const placeholderBg = tone === "dark" ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.04)";
  const plusColor = tone === "dark" ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.45)";

  return (
    <div
      className={`cv-photo-slot ${className || ""}`}
      style={{ width: size, height: size, position: "relative", flexShrink: 0, ...style }}
    >
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {photo ? (
        <>
          <img
            src={photo}
            alt=""
            onClick={() => fileRef.current?.click()}
            title="Replace photo"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "cover",
              cursor: "pointer",
              display: "block",
              boxShadow: "0 2px 8px rgba(15,23,42,0.18)",
            }}
          />
          <button
            type="button"
            className="cv-photo-remove"
            onClick={onRemove}
            title="Remove photo"
            aria-label="Remove photo"
          >×</button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Add photo"
          aria-label="Add photo"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: `2px dashed ${borderColor}`,
            background: placeholderBg,
            color: plusColor,
            fontSize: Math.round(size * 0.42),
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >+</button>
      )}
    </div>
  );
}

// Resize image in a canvas before encoding to keep base64 small enough for
// localStorage. 400px max on the longest side keeps the blob under ~80KB at
// JPEG q=0.85 — round display sizes are never larger than ~120px anyway.
async function resizeToBase64(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

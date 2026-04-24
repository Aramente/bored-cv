import { View, Image } from "@react-pdf/renderer";

/**
 * Circular profile photo for @react-pdf/renderer exports.
 *
 * Unlike the HTML PhotoSlot (which shows a clickable "+" placeholder when
 * empty), the PDF version is silent: no photo = renders nothing. Upload
 * happens in the editor; this component just mirrors whatever the user set
 * into the final document.
 *
 * Circular shape is achieved with borderRadius: 9999 + overflow: "hidden"
 * on a square-sized parent View — @react-pdf supports that combo. Falling
 * back to a square frame if the platform ever drops clip support would
 * still look fine, just sharp-cornered.
 */
interface Props {
  photo?: string;
  size?: number;
}

export default function PhotoSlotPdf({ photo, size = 72 }: Props) {
  if (!photo) return null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        overflow: "hidden",
      }}
    >
      <Image src={photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </View>
  );
}

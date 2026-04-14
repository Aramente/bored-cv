import re
import httpx


async def extract_company_colors(url: str) -> dict:
    """Scrape a company website and extract dominant brand colors."""
    try:
        # Try the company's main domain
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            html = resp.text

        # Extract colors from CSS
        colors = set()

        # Find hex colors in inline styles and style tags
        hex_colors = re.findall(r'#([0-9a-fA-F]{3,8})\b', html)
        for c in hex_colors:
            if len(c) in (3, 6):
                normalized = c.lower()
                # Skip whites, blacks, grays
                if normalized not in ('fff', 'ffffff', '000', '000000') and not _is_gray(normalized):
                    colors.add(f"#{normalized}")

        # Find rgb colors
        rgb_colors = re.findall(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', html)
        for r, g, b in rgb_colors:
            ri, gi, bi = int(r), int(g), int(b)
            if not (ri == gi == bi):  # skip grays
                hex_val = f"#{ri:02x}{gi:02x}{bi:02x}"
                colors.add(hex_val)

        # Take first few unique colors (most likely brand colors appear first in CSS)
        color_list = list(colors)[:6]

        if len(color_list) < 2:
            return {"primary": "#3B82F6", "secondary": "#1A365D", "colors": color_list}

        return {
            "primary": color_list[0],
            "secondary": color_list[1] if len(color_list) > 1 else color_list[0],
            "colors": color_list,
        }
    except Exception:
        return {"primary": "#3B82F6", "secondary": "#1A365D", "colors": []}


def _is_gray(hex_color: str) -> bool:
    if len(hex_color) == 3:
        r, g, b = int(hex_color[0]*2, 16), int(hex_color[1]*2, 16), int(hex_color[2]*2, 16)
    else:
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return abs(r - g) < 15 and abs(g - b) < 15

import ipaddress
import re
import socket
from urllib.parse import urlparse

import httpx


_DEFAULT_PALETTE = {"primary": "#3B82F6", "secondary": "#1A365D", "colors": []}


def _is_safe_public_url(url: str) -> bool:
    """Block SSRF: reject non-HTTP(S) schemes and private/loopback/link-local hosts.

    Specifically blocks the AWS metadata endpoint (169.254.169.254) and any
    RFC1918 / loopback / link-local / multicast / reserved range. Done by
    resolving the hostname and checking every returned A/AAAA record — a DNS
    rebinding attempt that resolves to a private IP still fails.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    # Reject literal IPs in private ranges before DNS lookup.
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_global
    except ValueError:
        pass  # Not a literal IP — resolve below.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except (ValueError, IndexError):
            return False
        if not ip.is_global:
            return False
    return True


async def extract_company_colors(url: str) -> dict:
    """Scrape a company website and extract dominant brand colors."""
    if not _is_safe_public_url(url):
        return dict(_DEFAULT_PALETTE)
    try:
        # Try the company's main domain. ``follow_redirects`` is intentionally
        # OFF — a public URL can 30x to a private IP, bypassing the SSRF check.
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            resp = await client.get(url)
            if resp.status_code in (301, 302, 303, 307, 308):
                # Follow one hop manually, but only if the new location is also safe.
                location = resp.headers.get("location", "")
                if location and _is_safe_public_url(location):
                    resp = await client.get(location)
                else:
                    return dict(_DEFAULT_PALETTE)
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

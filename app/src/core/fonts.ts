// Inter travels inside the app: it doesn't depend on the internet or an outside server.
// Only the Latin alphabets are loaded (Spanish, Portuguese, English and others).

import interLatinExt from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
// The italic is a script, as if written by hand (Dancing Script, OFL license).
import scriptLatinExt from "@fontsource-variable/dancing-script/files/dancing-script-latin-ext-wght-normal.woff2?url";
import scriptLatin from "@fontsource-variable/dancing-script/files/dancing-script-latin-wght-normal.woff2?url";

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

const FACES: Array<[family: string, url: string, unicodeRange: string, weight: string]> = [
  ["Inter", interLatin, LATIN, "100 900"],
  ["Inter", interLatinExt, LATIN_EXT, "100 900"],
  ["OuraBox Manuscrita", scriptLatin, LATIN, "400 700"],
  ["OuraBox Manuscrita", scriptLatinExt, LATIN_EXT, "400 700"],
];

export function loadFonts(): void {
  for (const [family, url, unicodeRange, weight] of FACES) {
    const face = new FontFace(family, `url(${url}) format("woff2")`, { weight, unicodeRange, display: "swap" });
    document.fonts.add(face);
    // If the font doesn't load, the system one is used: no reason to fail.
    face.load().catch(() => {});
  }
}

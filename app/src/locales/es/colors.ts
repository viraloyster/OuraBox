import type en from "../en/colors";
import type { Translation } from "../../i18n";

export default {
  ink: { ink: "Tinta", agua: "Azul agua", coral: "Coral", sol: "Ámbar", alga: "Verde", crepusculo: "Violeta" },
  basic: {
    black: "Negro",
    white: "Blanco",
    gray: "Gris",
    red: "Rojo",
    orange: "Naranja",
    yellow: "Amarillo",
    green: "Verde",
    turquoise: "Turquesa",
    blue: "Azul",
    purple: "Morado",
    pink: "Rosa",
    brown: "Café",
  },
  palettes: {
    pastel: "Pastel",
    earth: "Tierra",
    ocean: "Océano",
    forest: "Bosque",
    sunset: "Atardecer",
    skin: "Piel",
    vivid: "Vivos",
    grays: "Grises",
  },
} satisfies Translation<typeof en>;

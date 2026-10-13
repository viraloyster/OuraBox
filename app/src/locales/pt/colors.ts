import type en from "../en/colors";
import type { Translation } from "../../core/i18n";

export default {
  ink: { ink: "Tinta", agua: "Azul-água", coral: "Coral", sol: "Âmbar", alga: "Verde", crepusculo: "Violeta" },
  basic: {
    black: "Preto",
    white: "Branco",
    gray: "Cinza",
    red: "Vermelho",
    orange: "Laranja",
    yellow: "Amarelo",
    green: "Verde",
    turquoise: "Turquesa",
    blue: "Azul",
    purple: "Roxo",
    pink: "Rosa",
    brown: "Marrom",
  },
  palettes: {
    pastel: "Pastel",
    earth: "Terra",
    ocean: "Oceano",
    forest: "Floresta",
    sunset: "Pôr do sol",
    skin: "Pele",
    vivid: "Vivas",
    grays: "Cinzas",
  },
} satisfies Translation<typeof en>;

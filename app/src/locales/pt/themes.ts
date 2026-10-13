import type en from "../en/themes";
import type { Translation } from "../../i18n";

export default {
  clear: { name: "Céu aberto", mood: "Clareza para se concentrar" },
  morning: { name: "Manhã", mood: "Calma fresca para começar" },
  pinkAfternoon: { name: "Tarde rosada", mood: "Suavidade para criar" },
  sunset: { name: "Pôr do sol intenso", mood: "Energia que se apaga devagar" },
  grayDay: { name: "Dia cinza", mood: "Silêncio sem distrações" },
  rainy: { name: "Chuvoso", mood: "Refúgio para pensar" },
  storm: { name: "Tempestade", mood: "Intensidade contida" },
  blueHour: { name: "Hora azul", mood: "O momento entre o dia e a noite" },
  starryNight: { name: "Noite estrelada", mood: "Descanso visual com pouca luz" },
} satisfies Translation<typeof en>;

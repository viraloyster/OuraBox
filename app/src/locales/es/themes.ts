import type en from "../en/themes";
import type { Translation } from "../../core/i18n";

export default {
  clear: { name: "Despejado", mood: "Claridad para concentrarse" },
  morning: { name: "Mañana", mood: "Calma fresca para empezar" },
  pinkAfternoon: { name: "Tarde rosada", mood: "Suavidad para crear" },
  sunset: { name: "Atardecer intenso", mood: "Energía que se apaga despacio" },
  grayDay: { name: "Día gris", mood: "Silencio sin distracciones" },
  rainy: { name: "Lluvioso", mood: "Refugio para pensar" },
  storm: { name: "Tormenta", mood: "Intensidad contenida" },
  blueHour: { name: "Hora azul", mood: "El momento entre el día y la noche" },
  starryNight: { name: "Noche estrellada", mood: "Descanso visual con poca luz" },
} satisfies Translation<typeof en>;

import type en from "../en/resurface";
import type { Translation } from "../../i18n";

export default {
  label: "Una idea que vuelve",
  days: { one: "hace 1 día", other: "hace {count} días" },
  weeks: { one: "hace 1 semana", other: "hace {count} semanas" },
  months: { one: "hace 1 mes", other: "hace {count} meses" },
  years: { one: "hace 1 año", other: "hace {count} años" },
  youWrote: "{when} escribiste",
  untitled: "una idea sin título",
  question: "¿Sigue viva?",
  resume: "Retomar",
  resumeHint: "Abrirla ahora",
  rest: "Dejar reposar",
  restHint: "No volverá a aparecer en un mes",
  release: "Soltar",
  releaseHint: "Pasa a las soltadas: no se borra",
  close: "Cerrar",
} satisfies Translation<typeof en>;

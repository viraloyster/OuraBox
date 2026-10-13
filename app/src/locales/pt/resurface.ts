import type en from "../en/resurface";
import type { Translation } from "../../core/i18n";

export default {
  label: "Uma ideia que volta",
  days: { one: "há 1 dia", other: "há {count} dias" },
  weeks: { one: "há 1 semana", other: "há {count} semanas" },
  months: { one: "há 1 mês", other: "há {count} meses" },
  years: { one: "há 1 ano", other: "há {count} anos" },
  youWrote: "{when} você escreveu",
  untitled: "uma ideia sem título",
  question: "Ela ainda está viva?",
  resume: "Retomar",
  resumeHint: "Abrir agora",
  rest: "Deixar descansar",
  restHint: "Não vai aparecer de novo por um mês",
  release: "Soltar",
  releaseHint: "Vai para as ideias soltas: nada é apagado",
  close: "Fechar",
} satisfies Translation<typeof en>;

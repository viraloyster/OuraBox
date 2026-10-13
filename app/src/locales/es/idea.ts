import type en from "../en/idea";
import type { Translation } from "../../i18n";

export default {
  title: "Sobre esta idea",
  close: "Cerrar",
  purpose: "Lo que quiero lograr",
  purposePlaceholder: "¿Para qué existe esta idea?",
  next: "Siguiente paso",
  nextPlaceholder: "Uno solo, pequeño",
  assumptions: "¿Qué estás dando por hecho?",
  newAssumption: "Algo que doy por hecho…",
  states: {
    accept: "Lo acepto",
    break: "Quiero romperlo",
    unknown: "No sé",
  },
  stateHints: {
    accept: "Es una pared real, por ahora",
    break: "Aquí está el trabajo fuera de la caja",
    unknown: "Hay que averiguarlo",
  },
  whatToDo: "Qué hacer con: {text}",
  remove: "Quitar: {text}",
  attempts: "Intentos",
  untitled: "Sin título",
  attemptsHint: "Si este camino no funciona, el porqué puede seguir por otro.",
  newAttempt: "Nuevo intento",
  newAttemptHint: "Otro camino hacia lo mismo: conserva el porqué y la caja",
  history: "Historia",
  seeHistory: "Ver cómo creció",
  noHistory: "Todavía no hay versiones anteriores. Se guarda una cada pocos minutos mientras trabajas.",
  gotIt: "Entendido",
  version: "Versión",
  restore: "Traer esta versión",
  restoreHint: "La versión actual no se pierde: queda en la historia",
  present: "Volver al presente",
} satisfies Translation<typeof en>;

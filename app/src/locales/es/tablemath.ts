import type en from "../en/tablemath";
import type { Translation } from "../../i18n";

export default {
  error: "#error",
  cycle: "#ciclo",
  noNumbers: "sin números",
  invalidNumber: "número inválido",
  unknownSign: "signo desconocido: {sign}",
  missing: "falta \"{sign}\"",
  incompleteRange: "rango incompleto",
  rangeTooBig: "rango demasiado grande",
  incomplete: "fórmula incompleta",
  unknownFunction: "no conozco {name}",
  divisionByZero: "división por cero",
  extraAtEnd: "sobra algo al final",
  invalidResult: "resultado inválido",
} satisfies Translation<typeof en>;

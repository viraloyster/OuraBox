import type en from "../en/tablemath";
import type { Translation } from "../../core/i18n";

export default {
  error: "#erro",
  cycle: "#ciclo",
  noNumbers: "sem números",
  invalidNumber: "número inválido",
  unknownSign: "sinal desconhecido: {sign}",
  missing: "falta \"{sign}\"",
  incompleteRange: "intervalo incompleto",
  rangeTooBig: "intervalo grande demais",
  incomplete: "fórmula incompleta",
  unknownFunction: "não conheço {name}",
  divisionByZero: "divisão por zero",
  extraAtEnd: "sobrou algo no final",
  invalidResult: "resultado inválido",
} satisfies Translation<typeof en>;

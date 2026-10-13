import type en from "../en/roots";
import type { Translation } from "../../core/i18n";

export default {
  empty: "Ainda não há raízes. Em uma página, selecione uma frase e toque em “Aprofundar”.",
  noAssumptions: "Ainda sem premissas",
  more: { one: "e mais 1", other: "e mais {count}" },
} satisfies Translation<typeof en>;

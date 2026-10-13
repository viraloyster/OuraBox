import type en from "../en/roots";
import type { Translation } from "../../i18n";

export default {
  empty: "Todavía no hay raíces. En una hoja, elige una frase y toca «Profundizar».",
  noAssumptions: "Sin supuestos todavía",
  more: { one: "y 1 más", other: "y {count} más" },
} satisfies Translation<typeof en>;

import type en from "../en/dialogs";
import type { Translation } from "../../i18n";

export default {
  saveCopy: "Guardar una copia cifrada",
  openCopy: "Abrir una copia de OuraBox",
  copyFilter: "Copia de OuraBox",
  export: "Exportar",
  filters: { png: "Imagen PNG", md: "Texto (Markdown)", txt: "Texto", html: "Página web" },
  mailSubject: "Mi clave de recuperación de OuraBox",
  mailBody:
    "Mi clave de recuperación de OuraBox:\n\n{code}\n\nCon ella puedo entrar a mi espacio si olvido la contraseña, y abrir mis copias cifradas. Quien la tenga y tenga mi computadora o una copia puede leer mis ideas: este correo tiene que quedar bien protegido.",
} satisfies Translation<typeof en>;

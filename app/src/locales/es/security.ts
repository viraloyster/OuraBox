import type en from "../en/security";
import type { Translation } from "../../i18n";

export default {
  minutes: { one: "1 min", other: "{count} min" },
  hours: { one: "1 hora", other: "{count} horas" },
  never: "Nunca",
  export: "Crear una copia…",
  exporting: "Creando la copia…",
  exported: "Listo: {name}. Se abre con tu contraseña de hoy o con tu clave de recuperación.",
  currentPassword: "Contraseña actual",
  newPassword: "Contraseña nueva",
  repeatNewPassword: "Repite la contraseña nueva",
  newKey: "Crear una clave nueva",
  creating: "Creando…",
  newKeyDone: "Tu clave nueva. Guárdala fuera de esta computadora: no la volveremos a mostrar.",
  changePassword: "Cambiar contraseña",
  changing: "Cambiando…",
  changed: "Listo. Desde ahora, tu espacio se abre con la contraseña nueva.",
  deleteText: "Esto elimina tu usuario y todo lo que hay en tu espacio en esta computadora: tus ideas, archivos, notas y dibujos. No se puede deshacer. Las copias cifradas que ya hiciste no se eliminan, y los demás usuarios conservan sus espacios.",
  deleteUnderstand: "Entiendo que no se puede deshacer",
  deleteSubmit: "Eliminar usuario",
  deleting: "Eliminando…",
  cancel: "Cancelar",
} satisfies Translation<typeof en>;

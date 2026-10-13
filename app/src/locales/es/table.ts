import type en from "../en/table";
import type { Translation } from "../../core/i18n";

export default {
  toolbar: "Tabla",
  addRow: "Agregar fila",
  addColumn: "Agregar columna",
  removeRow: "Quitar fila",
  removeColumn: "Quitar columna",
  fillSeries: "Completar serie hacia abajo (1, 2… · lunes, martes… · enero…)",
  sumColumns: "Sumar columnas (fila de total)",
  removeTable: "Quitar la tabla",
  noPattern: "No encontré un patrón para continuar",
  total: "Total",
} satisfies Translation<typeof en>;

import type en from "../en/pane";
import type { Translation } from "../../i18n";

export default {
  noteColors: "Color de la nota",
  noteColor: "Color {name}",
  noColor: "Sin color",
  colorNames: {
    ink: "tinta",
    agua: "agua",
    coral: "coral",
    sol: "sol",
    alga: "alga",
    crepusculo: "crepúsculo",
  },
  label: "Etiqueta",
  noteLabel: "Etiqueta de la nota",
  nextDone: "Hecho",
  nextDoneLabel: "Marcar el siguiente paso como hecho",
  convert: "Convertir en archivo",
  convertHint: "Convertir en archivo: para trabajarla en serio",
  deepen: "Profundizar",
  goToRoot: "Ir a esta raíz",
  zoom: "Zoom",
  zoomOut: "Alejar",
  zoomIn: "Acercar",
  zoomLevel: "Zoom: tócalo para volver al 100 %",
  zoomLevelHint: "Volver al 100 % o ajustar",
  placeholder: "Escribe, dibuja o agrega una imagen…",
  saving: "Guardando…",
  saved: "Guardado",
  saveFailed: "No se pudo guardar",
} satisfies Translation<typeof en>;

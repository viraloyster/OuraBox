import type en from "../en/pane";
import type { Translation } from "../../core/i18n";

export default {
  noteColors: "Cor da nota",
  noteColor: "Cor {name}",
  noColor: "Sem cor",
  colorNames: {
    ink: "tinta",
    agua: "água",
    coral: "coral",
    sol: "âmbar",
    alga: "verde",
    crepusculo: "violeta",
  },
  label: "Etiqueta",
  noteLabel: "Etiqueta da nota",
  nextDone: "Feito",
  nextDoneLabel: "Marcar o próximo passo como feito",
  convert: "Converter em arquivo",
  convertHint: "Converter em arquivo: para trabalhar nela a sério",
  deepen: "Aprofundar",
  goToRoot: "Ir para esta raiz",
  zoom: "Zoom",
  zoomOut: "Afastar",
  zoomIn: "Aproximar",
  zoomLevel: "Zoom: toque para voltar a 100 %",
  zoomLevelHint: "Voltar a 100 % ou ajustar",
  placeholder: "Escreva, desenhe ou adicione uma imagem…",
  saving: "Salvando…",
  saved: "Salvo",
  saveFailed: "Não foi possível salvar",
} satisfies Translation<typeof en>;

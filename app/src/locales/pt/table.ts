import type en from "../en/table";
import type { Translation } from "../../core/i18n";

export default {
  toolbar: "Tabela",
  addRow: "Adicionar linha",
  addColumn: "Adicionar coluna",
  removeRow: "Remover linha",
  removeColumn: "Remover coluna",
  fillSeries: "Completar série para baixo (1, 2… · segunda, terça… · janeiro…)",
  sumColumns: "Somar colunas (linha de total)",
  removeTable: "Remover a tabela",
  noPattern: "Não encontrei um padrão para continuar",
  total: "Total",
} satisfies Translation<typeof en>;

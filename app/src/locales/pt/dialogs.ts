import type en from "../en/dialogs";
import type { Translation } from "../../core/i18n";

export default {
  saveCopy: "Salvar uma cópia criptografada",
  openCopy: "Abrir uma cópia do OuraBox",
  copyFilter: "Cópia do OuraBox",
  export: "Exportar",
  filters: { png: "Imagem PNG", md: "Texto (Markdown)", txt: "Texto", html: "Página da web" },
  mailSubject: "Minha chave de recuperação do OuraBox",
  mailBody:
    "Minha chave de recuperação do OuraBox:\n\n{code}\n\nCom ela posso entrar no meu espaço se esquecer a senha, e abrir minhas cópias criptografadas. Quem a tiver e tiver meu computador ou uma cópia pode ler minhas ideias: este e-mail precisa ficar bem protegido.",
} satisfies Translation<typeof en>;

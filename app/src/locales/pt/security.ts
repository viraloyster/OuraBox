import type en from "../en/security";
import type { Translation } from "../../core/i18n";

export default {
  minutes: { one: "1 min", other: "{count} min" },
  hours: { one: "1 hora", other: "{count} horas" },
  never: "Nunca",
  export: "Criar uma cópia…",
  exporting: "Criando a cópia…",
  exported: "Pronto: {name}. Ela abre com a sua senha de hoje ou com a sua chave de recuperação.",
  currentPassword: "Senha atual",
  newPassword: "Nova senha",
  repeatNewPassword: "Repita a nova senha",
  newKey: "Criar uma nova chave",
  creating: "Criando…",
  newKeyDone: "Sua nova chave. Guarde-a fora deste computador: não vamos mostrá-la de novo.",
  changePassword: "Alterar senha",
  changing: "Alterando…",
  changed: "Pronto. A partir de agora, seu espaço abre com a nova senha.",
  deleteText: "Isso exclui seu usuário e tudo o que há no seu espaço neste computador: suas ideias, arquivos, notas e desenhos. Não dá para desfazer. As cópias criptografadas que você já fez não são excluídas, e os outros usuários mantêm seus espaços.",
  deleteUnderstand: "Entendo que isso não pode ser desfeito",
  deleteSubmit: "Excluir usuário",
  deleting: "Excluindo…",
  cancel: "Cancelar",
} satisfies Translation<typeof en>;

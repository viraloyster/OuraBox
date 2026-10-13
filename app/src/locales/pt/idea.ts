import type en from "../en/idea";
import type { Translation } from "../../i18n";

export default {
  title: "Sobre esta ideia",
  close: "Fechar",
  purpose: "O que eu quero alcançar",
  purposePlaceholder: "Para que existe esta ideia?",
  next: "Próximo passo",
  nextPlaceholder: "Só um, pequeno",
  assumptions: "O que você está dando como certo?",
  newAssumption: "Algo que eu dou como certo…",
  states: {
    accept: "Eu aceito",
    break: "Quero quebrar",
    unknown: "Não sei",
  },
  stateHints: {
    accept: "É uma parede real, por enquanto",
    break: "Aqui está o trabalho fora da caixa",
    unknown: "É preciso descobrir",
  },
  whatToDo: "O que fazer com: {text}",
  remove: "Remover: {text}",
  attempts: "Tentativas",
  untitled: "Sem título",
  attemptsHint: "Se este caminho não funcionar, o porquê pode seguir por outro.",
  newAttempt: "Nova tentativa",
  newAttemptHint: "Outro caminho para o mesmo lugar: mantém o porquê e a caixa",
  history: "Histórico",
  seeHistory: "Ver como cresceu",
  noHistory: "Ainda não há versões anteriores. Uma é salva a cada poucos minutos enquanto você trabalha.",
  gotIt: "Entendi",
  version: "Versão",
  restore: "Trazer esta versão",
  restoreHint: "A versão atual não se perde: fica no histórico",
  present: "Voltar ao presente",
} satisfies Translation<typeof en>;

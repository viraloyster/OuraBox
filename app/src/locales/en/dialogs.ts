// Text for the system's own windows (save and open dialogs) and the recovery email.
export default {
  saveCopy: "Save an encrypted backup",
  openCopy: "Open an OuraBox backup",
  copyFilter: "OuraBox backup",
  export: "Export",
  filters: { png: "PNG image", md: "Text (Markdown)", txt: "Text", html: "Web page" },
  mailSubject: "My OuraBox recovery key",
  mailBody:
    "My OuraBox recovery key:\n\n{code}\n\nWith it I can get into my space if I forget the password, and open my encrypted backups. Anyone who has it and has my computer or a backup can read my ideas: this email has to stay well protected.",
};

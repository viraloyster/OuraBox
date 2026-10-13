// Messages for the errors that come from the core (`AppError.key`), and a
// generic one for everything else. The Rust side sends the same English text
// as `message`.
export default {
  generic: "Something went wrong.",

  // The space and the door
  locked: "The space is locked.",
  wrong_password: "Wrong password.",
  wrong_username_or_password: "Wrong username or password.",
  wrong_username_or_recovery_code: "Wrong username or recovery key.",
  wrong_recovery_code: "That recovery key does not open this space.",
  invalid_recovery_code: "That recovery key is not valid.",
  password_too_short: "The password needs at least 8 characters.",
  space_has_password: "This space already has a password.",
  space_has_no_password: "This space has no password yet.",
  no_legacy_space: "There is no earlier space.",
  username_required: "Type your username.",
  username_too_long: "A username can have up to 40 characters.",
  username_invalid_characters: "A username can only have letters, numbers, spaces, periods or dashes.",
  username_taken: "There is already a user with that name on this computer.",
  vault_corrupted: "The vault is damaged.",
  vault_from_newer_version: "This vault is from a newer version of OuraBox.",
  create_data_folder_failed: "Could not create the data folder.",
  move_space_failed: "Could not move your space to your user.",
  prepare_users_failed: "Could not prepare the users.",
  delete_user_failed: "Could not delete the user.",

  // Recovery email
  invalid_email: "That email doesn't look valid.",
  no_mail_app: "No email program was found on this computer.",

  // Documents
  document_changed_elsewhere: "This document changed somewhere else. Open it again to see the latest version.",
  document_deleted: "This document was deleted.",
  document_gone: "That document no longer exists.",
  document_not_found: "The document was not found.",
  document_corrupted: "The document is damaged.",
  document_too_large: "The document is too large.",
  document_from_newer_version: "This document is from a newer version of OuraBox.",
  invalid_document_id: "Invalid document id.",
  invalid_idea_id: "Invalid idea id.",
  invalid_root_id: "Invalid root id.",
  root_not_found: "The root was not found.",
  invalid_page_size: "Invalid page size.",
  too_many_text_boxes: "Too many text boxes on one page.",
  invalid_text_box: "A text box has invalid data.",
  unknown_color: "That color does not exist.",
  save_failed: "Could not save.",
  delete_document_failed: "Could not delete the document.",
  delete_unencrypted_failed: "Could not delete an unencrypted document.",

  // Projects
  invalid_project_id: "Invalid project id.",
  project_not_found: "The project was not found.",
  project_name_required: "The project needs a name.",
  project_not_in_trash: "The project has to go to the Trash first.",
  projects_corrupted: "The list of projects is damaged.",
  read_projects_failed: "Could not read the projects.",

  // History
  invalid_version: "Invalid version.",
  version_not_found: "That version was not found.",
  version_corrupted: "That version is damaged.",
  create_history_failed: "Could not create the history.",

  // Images
  invalid_image: "The image is not valid.",
  invalid_image_id: "Invalid image id.",
  image_type_not_allowed: "That type of image is not allowed.",
  image_too_large: "The image is too large.",
  image_not_found: "The image was not found.",
  image_corrupted: "The image is damaged.",
  save_image_failed: "Could not save the image.",

  // Export and encrypted backups
  unknown_format: "Unknown format.",
  export_damaged: "The export is damaged.",
  export_too_large: "The export is too large.",
  cannot_save_there: "It can't be saved there.",
  save_file_failed: "The file could not be saved.",
  file_exists: "There is already a file with that name. Choose another one.",
  cannot_open_file: "That file can't be opened.",
  choose_copy_first: "Choose the backup first.",
  copy_needs_new_space: "A backup can only be opened in a new space, without documents.",
  not_a_copy: "This file is not an OuraBox backup.",
  copy_not_found: "The backup was not found.",
  copy_from_newer_version: "This backup is from a newer version of OuraBox.",
  copy_corrupted: "The backup is damaged or incomplete.",
  wrong_password_for_copy: "That password does not open this backup.",
  wrong_recovery_code_for_copy: "That recovery key does not open this backup.",
  copies_desktop_only: "Backups only open in the desktop app.",
  read_vault_failed: "Could not read the vault.",
  read_file_failed: "Could not read a file.",
  save_copy_failed: "Could not save the backup.",
  open_copy_failed: "Could not open the backup.",

  internal: "Internal error.",
};

export interface StatusMessage {
  variant_id: string;
  file_name: string;
}

export interface StatusMessageWithFileContent extends StatusMessage {
  file_content: string;
}
